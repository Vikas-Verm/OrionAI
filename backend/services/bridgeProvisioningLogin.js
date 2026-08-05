"use strict";

/**
 * Beeper-style real-time QR login via the mautrix bridgev2 Provisioning API.
 *
 * The previous approach scraped QR images out of the bridge's Matrix
 * management room (bot posts an m.image, then EDITS it via m.replace every
 * time signalmeow/whatsmeow rotates the QR ~every 20-46s). By the time that
 * edit propagated through Synapse -> OrionAI's /sync -> the status poll, the
 * QR shown to the user was frequently a full rotation behind the bridge's
 * live QR. Each rotation uses a NEW keypair/uuid, so scanning a stale QR makes
 * the phone encrypt the link payload to a dead session -> "Network error" on
 * Signal, "Login failed: ... timed out" on WhatsApp.
 *
 * This module instead drives the bridge's Provisioning API directly:
 *
 *   POST /_matrix/provision/v3/login/start/{flow}        -> first QR + login_id
 *   POST /_matrix/provision/v3/login/step/{id}/{step}/display_and_wait
 *        -> long-polls; returns the NEXT live QR on rotation, or "complete"
 *           when the user scans, or an error when the QR cycle is exhausted.
 *
 * A background runner loops that chain so the QR we expose is ALWAYS the
 * bridge's current, live QR with sub-second lag — exactly how Beeper's client
 * links accounts. When a QR cycle is exhausted without a scan we transparently
 * start a fresh cycle so the user always has a scannable code (no dead ends).
 *
 * This is additive: it only owns the login/QR phase. Messaging, room listing
 * and "already connected" detection stay on the existing Matrix code paths.
 */

const axios = require("axios");

const PROVISION_PATH = "/_matrix/provision/v3";

// How long a single connect attempt keeps producing fresh QRs before it gives
// up and asks the user to click Connect again. Mirrors the old active-login
// window so behaviour elsewhere stays familiar.
const OVERALL_BUDGET_MS = 5 * 60 * 1000;
// Long-poll ceiling for a single display_and_wait. The bridge returns at each
// QR rotation (~20-46s) or immediately on scan, so this is just a safety net.
const WAIT_TIMEOUT_MS = 130 * 1000;
const START_TIMEOUT_MS = 25 * 1000;
// Small delay before starting a fresh QR cycle so we never hot-loop the bridge.
const CYCLE_COOLDOWN_MS = 400;
const WHOAMI_TIMEOUT_MS = 10 * 1000;

// bridgev2 connection states. A login in any of the "healthy" states means the
// account is paired and usable (or transiently reconnecting) — we must treat it
// as CONNECTED and immediately stop showing QR codes. A login in a "dead" state
// has been logged out by the network (e.g. Signal 4401 "Reauthentication
// required" -> 403, or WhatsApp logout) and should be cleared before a fresh
// link so re-pairing doesn't pile up dead devices / trip the device limit.
const HEALTHY_LOGIN_STATES = new Set([
  "CONNECTED",
  "CONNECTING",
  "BACKFILLING",
  "TRANSIENT_DISCONNECT",
]);
const DEAD_LOGIN_STATES = new Set([
  "BAD_CREDENTIALS",
  "LOGGED_OUT",
]);

function loginStateEvent(login) {
  return String(
    (login && (login.state_event || (login.state && login.state.state_event))) ||
      ""
  ).toUpperCase();
}

function networkConfig(network) {
  if (network === "signal") {
    return {
      baseUrl:
        process.env.SIGNAL_BRIDGE_PROVISION_URL || "http://127.0.0.1:29328",
      secret:
        process.env.SIGNAL_BRIDGE_PROVISION_SECRET ||
        "8nMh39WCw8vPiW1pG4ja7LDbFg3540AIHT8od9Q5K37yVuDJMK2BVEgPrLRNsExJ",
      flowId: "qr",
    };
  }
  if (network === "whatsapp") {
    return {
      baseUrl:
        process.env.WHATSAPP_BRIDGE_PROVISION_URL || "http://127.0.0.1:29318",
      secret:
        process.env.WHATSAPP_BRIDGE_PROVISION_SECRET ||
        "wA7kQ2mZ9vX4pL8nR3tY6bH1cJ5dF0sGoEuItOaSeVmKqWzN",
      flowId: "qr",
    };
  }
  throw new Error(`Unknown bridge network: ${network}`);
}

/** key -> ProvisioningLoginRunner */
const runners = new Map();
const runnerKey = (network, mxid) => `${network}:${mxid}`;

class ProvisioningLoginRunner {
  constructor(network, mxid) {
    this.network = network;
    this.mxid = String(mxid || "").trim();
    this.cfg = networkConfig(network);
    this.phase = "idle"; // idle|starting|qr|connected|error|timeout
    this.qrData = "";
    this.error = "";
    this.loginId = "";
    this.userLoginId = "";
    this.startedAt = 0;
    this.updatedAt = Date.now();
    this.stopped = false;
    this._loop = null;
  }

  _client() {
    return axios.create({
      baseURL: `${this.cfg.baseUrl}${PROVISION_PATH}`,
      headers: {
        Authorization: `Bearer ${this.cfg.secret}`,
        "Content-Type": "application/json",
      },
      params: { user_id: this.mxid },
      validateStatus: () => true,
      // We pass an explicit timeout per request below.
    });
  }

  _set(patch) {
    Object.assign(this, patch);
    this.updatedAt = Date.now();
  }

  getState() {
    return {
      network: this.network,
      mxid: this.mxid,
      phase: this.phase,
      qrData: this.qrData,
      error: this.error,
      loginId: this.loginId,
      userLoginId: this.userLoginId,
      updatedAt: this.updatedAt,
      ageMs: Date.now() - this.updatedAt,
    };
  }

  start({ force = false } = {}) {
    // Already producing QRs for this user — don't stack runners.
    if (this._loop && !this.stopped && ["starting", "qr"].includes(this.phase)) {
      return;
    }
    this.force = Boolean(force);
    this.stopped = false;
    this.startedAt = Date.now();
    this._set({
      phase: "starting",
      qrData: "",
      error: "",
      loginId: "",
      userLoginId: "",
    });
    this._loop = this._run().catch((err) => {
      this._set({
        phase: "error",
        error: String(err?.message || err || "Login failed"),
      });
    });
  }

  stop() {
    this.stopped = true;
  }

  /** Fetch the bridge's authoritative list of logins for this Matrix user. */
  async _whoamiLogins() {
    try {
      const r = await this._client().get("/whoami", {
        timeout: WHOAMI_TIMEOUT_MS,
      });
      if (r.status !== 200 || !r.data || !Array.isArray(r.data.logins)) {
        return null;
      }
      return r.data.logins;
    } catch (err) {
      return null;
    }
  }

  /**
   * Returns a paired/usable login for this user if one exists, else null.
   * This is the SOURCE OF TRUTH for "is the account linked" — exactly how
   * Beeper drives its QR screen: the moment the bridge reports a healthy
   * login, the QR is done. Relying only on the provisioning `complete` event
   * is fragile (a scan that lands at a QR-cycle boundary is easily missed),
   * and a missed completion is catastrophic: we'd keep showing fresh QRs, the
   * user keeps scanning them, and each re-link makes the network log the
   * account out (Signal 4401 reauth, WhatsApp re-pair churn).
   */
  async _healthyLogin() {
    const logins = await this._whoamiLogins();
    if (!logins) return null;
    return (
      logins.find((l) => HEALTHY_LOGIN_STATES.has(loginStateEvent(l))) || null
    );
  }

  /** Best-effort: log out any dead (logged-out) logins before a fresh link. */
  async _logoutDeadLogins() {
    const logins = await this._whoamiLogins();
    if (!logins) return;
    for (const login of logins) {
      if (!DEAD_LOGIN_STATES.has(loginStateEvent(login)) || !login.id) continue;
      try {
        await this._client().post(
          `/logout/${encodeURIComponent(login.id)}`,
          "",
          { timeout: WHOAMI_TIMEOUT_MS }
        );
      } catch (err) {
        // Non-fatal — the worst case is a stale device lingers; the fresh
        // link still proceeds.
      }
    }
  }

  _markConnected(login) {
    this._set({
      phase: "connected",
      userLoginId: String((login && login.id) || this.userLoginId || ""),
      error: "",
    });
  }

  async _run() {
    const client = this._client();
    const deadline = this.startedAt + OVERALL_BUDGET_MS;

    // ---- Pre-flight: never show a QR for an already-linked account ----
    // If the bridge already has a healthy login, the user is connected. Showing
    // a QR here is what creates the re-link death spiral. A forced re-link
    // (caller cleared the old session first) skips this gate.
    if (!this.force) {
      const already = await this._healthyLogin();
      if (already) {
        this._markConnected(already);
        return;
      }
    }

    // Clear any dead/logged-out session so re-pairing starts clean.
    await this._logoutDeadLogins();

    while (!this.stopped && Date.now() < deadline) {
      // ---- Start a fresh QR cycle ----
      let resp;
      try {
        const r = await client.post(`/login/start/${this.cfg.flowId}`, "", {
          timeout: START_TIMEOUT_MS,
        });
        if (r.status !== 200 || !r.data) {
          this._set({
            phase: "starting",
            error: this._errText(r) || "",
          });
          await sleep(CYCLE_COOLDOWN_MS);
          continue;
        }
        resp = r.data;
      } catch (err) {
        // Bridge unreachable / transient — keep the UI in "starting" and retry.
        this._set({ phase: "starting", error: "" });
        await sleep(800);
        continue;
      }

      // ---- Drive the display_and_wait chain (one QR per rotation) ----
      while (!this.stopped && resp && resp.type === "display_and_wait") {
        const dw = resp.display_and_wait || {};
        if (dw.data) {
          this._set({
            phase: "qr",
            qrData: String(dw.data),
            loginId: String(resp.login_id || this.loginId || ""),
            error: "",
          });
        }
        try {
          const r = await client.post(
            `/login/step/${encodeURIComponent(
              resp.login_id
            )}/${encodeURIComponent(resp.step_id)}/display_and_wait`,
            "",
            { timeout: WAIT_TIMEOUT_MS }
          );
          if (r.status !== 200 || !r.data) {
            // Terminal for this cycle (e.g. "too many QR code refreshes").
            resp = null;
            break;
          }
          resp = r.data;
        } catch (err) {
          // Long-poll hiccup — drop out and start a clean cycle.
          resp = null;
          break;
        }
      }

      if (this.stopped) return;

      // ---- Resolve the cycle outcome ----
      if (resp && resp.type === "complete") {
        const userLoginId =
          (resp.complete && resp.complete.user_login_id) ||
          resp.user_login_id ||
          resp.login_id ||
          this.loginId ||
          "";
        this._set({ phase: "connected", userLoginId: String(userLoginId), error: "" });
        return;
      }

      // BACKUP completion check (the important one). The provisioning
      // `complete` event is easy to miss when a scan lands right as the QR
      // cycle rotates/exhausts. The bridge's whoami is authoritative: if the
      // account is now linked, we're done — STOP showing QRs so the user never
      // re-scans and triggers a network-side logout.
      const landed = await this._healthyLogin();
      if (landed) {
        this._markConnected(landed);
        return;
      }

      if (resp && resp.type && resp.type !== "display_and_wait") {
        // Unexpected non-QR step (user_input/cookies) — we only support QR here.
        this._set({
          phase: "error",
          error: `Unsupported login step: ${resp.type}`,
        });
        return;
      }

      // QR cycle exhausted without a scan -> seamlessly start a new one.
      await sleep(CYCLE_COOLDOWN_MS);
    }

    if (!this.stopped && this.phase !== "connected") {
      this._set({ phase: "timeout", error: "" });
    }
  }

  _errText(resp) {
    const d = resp && resp.data;
    if (!d) return "";
    return String(d.error || d.message || d.errcode || "").trim();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRunner(network, mxid, { create = false } = {}) {
  const key = runnerKey(network, mxid);
  let runner = runners.get(key);
  if (!runner && create) {
    runner = new ProvisioningLoginRunner(network, mxid);
    runners.set(key, runner);
  }
  return runner || null;
}

/** Start (or reuse) a real-time QR login for a bridge user. */
function startLogin(network, mxid, { force = false } = {}) {
  const runner = getRunner(network, mxid, { create: true });
  runner.start({ force });
  return runner.getState();
}

/** Current login runner state, or null if none is active for this user. */
function getLoginState(network, mxid) {
  const runner = getRunner(network, mxid);
  return runner ? runner.getState() : null;
}

/** Stop and forget the login runner for a user (call on connect/logout). */
function stopLogin(network, mxid) {
  const key = runnerKey(network, mxid);
  const runner = runners.get(key);
  if (runner) {
    runner.stop();
    runners.delete(key);
  }
}

function clearBridgeAccountState(network, mxid) {
  accountStateCache.delete(runnerKey(network, mxid));
}

// ---- Authoritative bridge account state (the Beeper source of truth) ----
// getSignalStatus / getWhatsAppStatus historically inferred "connected" from a
// local bridge DB copy (stale SQLite for Signal once the bridge moved to
// Postgres) or from scraped Matrix management-room messages (which keep an old
// "logged out from another device" notice around long after the account
// reconnects). Both lie. The bridge's own Provisioning `whoami` always reports
// the live connection state, so we expose it here and let status callers trust
// it first. A tiny TTL cache keeps per-poll bridge load negligible.
const ACCOUNT_STATE_TTL_MS = 3000;
const accountStateCache = new Map(); // `${network}:${mxid}` -> { expiresAt, value }

function provisionClient(network, mxid) {
  const cfg = networkConfig(network);
  return axios.create({
    baseURL: `${cfg.baseUrl}${PROVISION_PATH}`,
    headers: { Authorization: `Bearer ${cfg.secret}` },
    params: { user_id: String(mxid || "").trim() },
    validateStatus: () => true,
  });
}

async function fetchBridgeAccountState(network, mxid) {
  const m = String(mxid || "").trim();
  if (!m) return { connected: false, login: null, logins: [] };
  try {
    const r = await provisionClient(network, m).get("/whoami", {
      timeout: WHOAMI_TIMEOUT_MS,
    });
    if (r.status !== 200 || !r.data || !Array.isArray(r.data.logins)) {
      return { connected: false, login: null, logins: [] };
    }
    const logins = r.data.logins;
    const login =
      logins.find((l) => HEALTHY_LOGIN_STATES.has(loginStateEvent(l))) || null;
    const profile = (login && login.profile) || {};
    return {
      connected: Boolean(login),
      login,
      logins,
      profile,
      phone: String(profile.phone || (login && login.name) || "").trim(),
      name: String(profile.name || "").trim(),
      avatar: String(profile.avatar || "").trim(),
      userLoginId: String((login && login.id) || "").trim(),
    };
  } catch (err) {
    return { connected: false, login: null, logins: [] };
  }
}

/**
 * Live connection state for a bridge account, straight from the bridge's
 * Provisioning whoami. Short TTL-cached. Never throws.
 */
async function getBridgeAccountState(network, mxid) {
  const key = runnerKey(network, mxid);
  const cached = accountStateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchBridgeAccountState(network, mxid);
  accountStateCache.set(key, {
    expiresAt: Date.now() + ACCOUNT_STATE_TTL_MS,
    value,
  });
  return value;
}

async function logoutAllLogins(network, mxid) {
  const m = String(mxid || "").trim();
  if (!m) {
    return { ok: false, reason: "no_mxid", loggedOut: 0, failed: 0 };
  }

  stopLogin(network, m);
  clearBridgeAccountState(network, m);

  const client = provisionClient(network, m);
  let logins = [];
  try {
    const r = await client.get("/whoami", { timeout: WHOAMI_TIMEOUT_MS });
    if (r.status !== 200 || !Array.isArray(r.data?.logins)) {
      return {
        ok: false,
        reason: r.data?.error || r.data?.errcode || `whoami_${r.status}`,
        loggedOut: 0,
        failed: 0,
      };
    }
    logins = r.data.logins;
  } catch (err) {
    return {
      ok: false,
      reason: err?.message || "whoami_failed",
      loggedOut: 0,
      failed: 0,
    };
  }

  let loggedOut = 0;
  let failed = 0;
  for (const login of logins) {
    const id = String(login?.id || "").trim();
    if (!id) continue;
    try {
      const r = await client.post(`/logout/${encodeURIComponent(id)}`, "", {
        timeout: WHOAMI_TIMEOUT_MS,
      });
      if (r.status >= 200 && r.status < 300) {
        loggedOut += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  clearBridgeAccountState(network, m);
  return { ok: failed === 0, loggedOut, failed };
}

module.exports = {
  startLogin,
  getLoginState,
  stopLogin,
  getBridgeAccountState,
  logoutAllLogins,
  clearBridgeAccountState,
};
