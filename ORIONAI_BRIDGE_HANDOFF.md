# OrionAI — WhatsApp / Signal Bridge Handoff & Working Notes

> **Purpose of this file:** OrionAI integrates WhatsApp + Signal (via mautrix
> Matrix bridges) and Gmail/Slack. This document is the running memory of the
> bridge work — root causes already diagnosed, fixes applied, and the open
> issue backlog. **If you are a new developer/AI picking this up, read this
> first.** Keep it updated as you change things.
>
> Standing constraint from the product owner (verbatim, must always hold):
> **"Don't change/touch any other existing functionality."** Make additive,
> surgical changes. The goal is parity with Beeper / real WhatsApp Web — "it
> should work very smoothly."

---

## 1. Architecture (how the bridge stack fits together)

```
 Phone (WhatsApp / Signal app)
        │  scans QR / linked device
        ▼
 mautrix-whatsapp (Go, whatsmeow)      mautrix-signal (Go, signalmeow)
   HTTP listener 127.0.0.1:29318         HTTP listener 127.0.0.1:29328
   (appservice + Provisioning API)       (appservice + Provisioning API)
        │                                     │
        └──────────────┬──────────────────────┘
                       ▼
                 Synapse homeserver  (localhost:8008, domain `orion.local`)
                       │
                 mautrix-postgres  (host port 5433 -> container 5432)
                   DBs: mautrix_signal, mautrix_whatsapp
                       ▲
 OrionAI backend (Express + Mongoose, Node 20, runs under nodemon on :3000)
   - services/whatsappMatrixService.js  (reads bridge Postgres via `pg`)
   - services/signalMatrixService.js    (⚠ still reads STALE local SQLite — see §3)
   - services/bridgeProvisioningLogin.js (real-time QR login + whoami source of truth)
   - Mongo `integrations` collection stores per-user link state
        ▲
 Frontend (Vue 3 + Vite, localhost:5173)  — WhatsApp / Signal / Slack pages
```

Everything runs locally via `infra/docker-compose.yml`. Bridges are published to
`127.0.0.1` only (never the LAN).

### Key facts / gotchas
- **Bridges run on Postgres**, not SQLite. The Signal service still opens an
  *old* SQLite file (`infra/mautrix-signal/mautrix-signal.db`, frozen ~May 27).
  WhatsApp service correctly uses `pg` against Postgres (port 5433).
- **better-sqlite3 needs Node 20.** Shell default may be Node 18. Use
  `~/.nvm/versions/node/v20.18.2/bin/node` for any standalone scripts.
- **Backend runs under nodemon** → it auto-reloads on save and clears in-memory
  caches on reload. Health check: `curl -s -o /dev/null -w '%{http_code}'
  http://127.0.0.1:3000/api/health` → `401` means up (auth-gated).
- **Mongo**: integrations are in the generic `integrations` collection
  (`type: "signal" | "whatsapp"`), `userId` e.g. `vikasverma`.
- **mxid schemes differ per network** (important!):
  - Signal:   `@orion_u_<user>:orion.local`            (no suffix)
  - WhatsApp: `@orion_u_<user>_whatsapp:orion.local`   (note `_whatsapp`)
  - Built by `buildHiddenMxid(buildWhatsAppMatrixUserKey(userId))` etc.
- **Provisioning API** (per network, bridgev2 / "megabridge"):
  - `POST /_matrix/provision/v3/login/start/{flow}?user_id=X` → first QR + login_id
  - `POST /_matrix/provision/v3/login/step/{login_id}/{step_id}/display_and_wait`
    → long-poll; returns next QR on rotation, `type:"complete"` on scan, or non-200 on exhaustion
  - `GET  /_matrix/provision/v3/whoami?user_id=X` → live `logins[]` with `state_event`
  - `POST /_matrix/provision/v3/logout/{login_id}?user_id=X` → drop a login
  - Auth: header `Authorization: Bearer <shared_secret>` + query `?user_id=@...`
  - Secrets live in `backend/.env` (`SIGNAL_BRIDGE_PROVISION_SECRET`,
    `WHATSAPP_BRIDGE_PROVISION_SECRET`) and the bridge `config.yaml`
    `provisioning.shared_secret`. They must match.
- **`state_event` values** (the truth for "is it connected"):
  - Healthy: `CONNECTED`, `CONNECTING`, `BACKFILLING`, `TRANSIENT_DISCONNECT`
  - Dead:    `BAD_CREDENTIALS`, `LOGGED_OUT`

### Useful diagnostic commands
```bash
# live login state for a user (the source of truth)
curl -s -H "Authorization: Bearer $WHATSAPP_BRIDGE_PROVISION_SECRET" \
  "http://127.0.0.1:29318/_matrix/provision/v3/whoami?user_id=@orion_u_vikasverma_whatsapp:orion.local" | python3 -m json.tool

# bridge Postgres
docker exec mautrix-postgres psql -U mautrix -d mautrix_whatsapp -c \
  "select id, user_mxid, remote_name from user_login;"
docker exec mautrix-postgres psql -U mautrix -d mautrix_signal -c \
  "select id, user_mxid, remote_name, metadata->>'phone' from user_login;"

# bridge logs
docker logs mautrix-signal   --since 30m 2>&1 | grep -iE "pair|qr|login|CONNECTED|BAD_CRED"
docker logs mautrix-whatsapp --since 30m 2>&1 | grep -iE "515|logged out|EOF|send"
```

---

## 2. Root causes already DIAGNOSED & FIXED (don't re-litigate these)

### A. "Network error" on scan / "QR keeps preparing" — stale QR  *(FIXED)*
The old flow scraped QR images out of the Matrix management room (bot posts an
`m.image`, edits it via `m.replace` on every rotation). signalmeow/whatsmeow
rotate the QR every ~20–46s, each with a **new keypair**. By the time the edit
propagated through Synapse → /sync → poll, the QR shown was a full rotation
behind → phone encrypts to a dead session → "Network error".
**Fix:** `services/bridgeProvisioningLogin.js` drives the Provisioning API
directly and long-polls `display_and_wait`, so the QR shown is always the live
one (sub-second lag), exactly like Beeper.

### B. Login "death spiral" → account logged out after scan  *(FIXED)*
The runner relied only on the provisioning `complete` event. A scan that lands
at a QR-cycle boundary is easily missed → the runner kept showing **new** QRs →
the user re-scanned → each re-link made the network log the account out:
- Signal: `StatusCode(4401) "Reauthentication required"` → `403 logged out` → `BAD_CREDENTIALS`
- WhatsApp: `515` ("restart required" — normal post-pair) churn + spurious `action=login` sockets
**Fix (the Beeper model — bridge state is the source of truth):**
1. Pre-flight gate: never show a QR if the bridge already has a healthy login.
2. After every QR cycle, re-check `whoami`; the moment a healthy login appears, STOP.
3. Clear dead (`BAD_CREDENTIALS`/`LOGGED_OUT`) logins before a fresh link.
   See `_healthyLogin()`, `_logoutDeadLogins()`, `start({force})` in the runner.

### C. Status said "not connected" though the bridge was CONNECTED  *(FIXED)*
`getStatus` inferred "connected" from unreliable local sources:
- Signal read the **stale SQLite** (bridge moved to Postgres) → reported `pending_qr`.
- WhatsApp read an **old management-room message** → reported stale
  `error: "logged out from another device"`.
**Fix:** added `getBridgeAccountState(network, mxid)` to the runner module — it
calls the live `whoami` (3s TTL cache) and is now the source of truth.
- `getSignalStatus`: `bridgeConnected = whoamiConnected || isSignalBridgeLoginActive(...)`
- `getWhatsAppStatus`: if `acctState.connected` → force `connected/loginState="connected"`, clear stale error.

### D. Messages "sent" but not delivered  *(IMPROVED)*
Contributing factor was spurious concurrent login sockets (from B) destabilizing
the live whatsmeow session, plus Docker-Desktop-macOS NAT/DNS flakiness
(mitigated in `docker-compose.yml` via `dns: [1.1.1.1, 8.8.8.8]`, `dns_opt:
use-vc`, and TCP keepalive sysctls). After fixing B, delivery works. Keep an eye
on `TRANSIENT_DISCONNECT` flapping in logs if it regresses.

### Files changed so far
- `backend/services/bridgeProvisioningLogin.js`  (NEW — runner + whoami truth)
- `backend/services/signalMatrixService.js`      (require + status short-circuit + whoami connected)
- `backend/services/whatsappMatrixService.js`    (require + status short-circuit + whoami connected)
- `backend/.env`                                  (provisioning URLs + secrets)
- `infra/docker-compose.yml`                      (publish bridge ports, DNS, keepalive sysctls)
- `infra/mautrix-whatsapp/config.yaml`            (provisioning shared_secret)
- `infra/mautrix-signal/config.yaml`              (provisioning shared_secret; log level)

---

## 3. Signal chat list — ROOT CAUSE FOUND & FIXED  *(2026-06-03)*
The real root cause of issue #1 was **NOT** the stale SQLite read. It was
**unaccepted Matrix invites**. Empirically verified:
- The Signal bridge (bridgev2/megabridge) runs on **Postgres** and creates one
  **portal room per chat**, then *invites* the user puppet
  `@orion_u_vikasverma:orion.local`.
- Those rooms sat in `/sync` under **`rooms.invite`**, never `rooms.join`.
  `listMatrixSignalRooms` only reads `rooms.join` → chat list was empty forever
  → UI stuck on "Syncing your Signal chats…".
- Proof: portal rooms `!sRHdFjvptsxdnWsdTX` (Note to Self) + `!jwuxMdqUBUNQJPLClq`
  (aaru verma) were in `invite` (inviter `@signalbot:orion.local`). After a
  `POST /rooms/{id}/join`, joined-room count went 1 → 3 and they appeared.

**Fix (Beeper-parity, mirrors WhatsApp's `discoverPendingBridgeInvites` /
`ensureBridgePortalRoomsJoined`):** added to `signalMatrixService.js`:
- `discoverPendingSignalBridgeInvites(userId,{bridgeBotMxid})` — reads
  `/sync rooms.invite`, matches inviter == bridge bot OR `isSignalGhostMxid`.
- `ensureSignalPortalRoomsJoined(userId,{config})` — joins those invites via
  the existing `ensureJoinedSignalRoom`, then `invalidateSignalCache`.
- `listSignalRooms` now calls it **gated on `getBridgeAccountState("signal").connected`**
  (so we never auto-join orphan invites from a dead/old session) before listing.

> NOTE: both the Signal *and* WhatsApp local SQLite snapshot files are frozen
> (May 27); both bridges are on Postgres. WhatsApp's chat list works because it
> is driven from **Matrix /sync** (joined rooms), not the snapshot — same as
> Signal now. The snapshot reads are only enrichment/fallback and are harmless.

---

## 4. OPEN ISSUE BACKLOG (requested 2026-06-03)

Status legend: ⬜ todo · 🔄 in progress · ✅ done

- ✅ **#1 Signal stuck "Syncing your Signal chats…" (~1hr+)**  *(FIXED 2026-06-03)*
  Root cause was unaccepted Matrix portal invites (see §3), not the SQLite read.
  Fix: auto-accept Signal portal-room invites in `listSignalRooms` via the new
  `ensureSignalPortalRoomsJoined` (gated on a healthy whoami login). Verified:
  joining the invited rooms makes them appear in `/sync` and populates the list.
- ✅ **#2 WhatsApp chat list ordering**  *(FIXED 2026-06-03)*
  Removed unread-first ordering in `listWhatsAppChats` final sort
  (`whatsappMatrixService.js`). Now: pinned first → `lastMessageTs` desc →
  title localeCompare. Most recent conversation sorts to the top.
- ✅ **#3 Unread badges don't clear**  *(SAFE FIX 2026-06-03 — full parity deferred)*
  Two parts. (a) Frontend now persists per-room read cutoffs to localStorage
  (`orion.whatsapp.readCutoffs` in `WhatsAppPage.vue`) so a chat you read in
  OrionAI stays read across reloads. (b) `markWhatsAppRoomAsRead` now also POSTs
  an `m.fully_read` marker alongside the `m.read` receipt.
  **Still deferred:** chats read **on the phone** won't auto-clear in OrionAI
  without **double-puppeting** (our puppet must send the read receipt). See
  "Double-puppeting" note below — post-launch step.
- ✅ **#4 "WhatsApp Status Broadcast" rendered as a normal chat**  *(FIXED 2026-06-03)*
  `buildRoomDescriptor` now detects Status Broadcast (`isStatusBroadcast`:
  name === "whatsapp status broadcast" / includes "status broadcast" /
  `status@broadcast` in ghost id|mxid) and it is excluded from
  `listMatrixWhatsAppRooms` and the final `listWhatsAppChats` filter, so it no
  longer pollutes the normal chat list.
- ✅ **#5 Muted chats still generate notifications**  *(SAFE FIX 2026-06-03 — full parity deferred)*
  Added an **OrionAI-side mute list**: `whatsapp.mutedRooms: [String]` on the
  Integration schema. Helpers `getMutedRoomSet` / `setWhatsAppRoomMuted` /
  `getMutedRoomIds` in `whatsappMatrixService.js`; `isMuted` is applied per-chat
  in `listWhatsAppChats`, and muted chats are filtered out of
  `getWhatsAppUnreadSummary` (so they don't drive notification badges/poll).
  Route: `POST /api/whatsapp/rooms/:roomId/mute { muted }`. Frontend: Mute/Unmute
  button in the chat info panel (`toggleMuteCurrentRoom`, optimistic update).
  **Still deferred:** mute state set **on the phone** isn't visible to us (stored
  as Matrix push rules) without **double-puppeting** — post-launch step.
- ✅ **#6 WhatsApp page UI/UX parity with real WhatsApp Web**  *(2026-06-03)*
  The composer (`WhatsAppPage.vue`) already has full WA-Web functionality:
  attach, emoji picker (emoji-mart), GIF search, voice recording, reply preview,
  draft attachment strip, Enter-to-send. **Deliberately NOT re-themed to WA-Web
  light colors** — the page uses OrionAI's dark theme for app-wide consistency;
  a light clone would clash with every other page and was judged unsafe pre-launch.
  Safe authenticity refinements applied (CSS only, no DOM/JS changes):
  bubble tails moved to the authentic top corner (incoming top-left, outgoing
  top-right) and the send button is now circular like WA-Web's mic/send button.
  If a future pass wants deeper parity, do it as a scoped theming task — keep the
  existing component structure & handlers intact.
- ✅ **#7 New WhatsApp messages not real-time on Workspace Briefing page**  *(FIXED 2026-06-03)*
  WhatsApp is Matrix-bridged with no push client (unlike Telegram MTProto), so it
  previously only updated on the 15s poll — reload felt faster, hence "not
  real-time." Added a **Matrix `/sync` long-poll listener**:
  `waitForWhatsAppActivity(userId,{since,timeoutMs})` in `whatsappMatrixService.js`
  (one long-poll, reports `{nextBatch, hasNewActivity}`), driven by
  `startWhatsAppListener(userId)` in `websocketServer.js` (started on WS connect,
  stopped on last-tab disconnect, gated on WhatsApp connection state, exp backoff).
  On new incoming activity it calls `refreshUserSignals` → the normal poll path
  broadcasts `notification_update`. The frontend (`WorkspaceBriefing.vue`) already
  reacts via the `liveSignalFingerprint` watch → `scheduleLiveRefresh` → reload of
  `/api/briefing/home`. Net effect: new WhatsApp messages surface within ~1s.

### ⚠ Double-puppeting (post-launch) — needed for FULL #3 / #5 parity
OrionAI keeps its own read/mute state (localStorage cutoffs + `mutedRooms`).
True parity with the phone (phone-read clears unread; phone-mute suppresses
notifications) requires **double-puppeting** so our Synapse user's puppet sends
read receipts / owns push rules. Blocker: the WhatsApp appservice
`registration.yaml` user namespace only covers `^@whatsappbot:orion\.local

 and
`^@whatsapp_.*:orion\.local

; the real Synapse account
`@orion_u_<user>_whatsapp:orion.local` is OUTSIDE it, so the `as_token`
double-puppet shortcut can't impersonate it. Fix = add that namespace + restart
Synapse/bridges (deferred per product owner: "safe fixes only now").

### Frontend entry points (Vue 3 + Vite, `localhost:5173`)
- Routes seen in UI: `/signal`, `/whatsapp` (+ Workspace Briefing page).
- Look under `frontend/src/` for the WhatsApp/Signal page components, the chat
  list component, message input component, and the briefing/dashboard page.
  (Fill in exact paths as you find them.)

---

## 5. Change log
- 2026-05-30 — Diagnosed & fixed root causes A–D (QR death spiral, whoami source
  of truth). Both Signal + WhatsApp verified `connected:true` via direct status
  calls. Delivery confirmed working by product owner.
- 2026-06-03 — Logged open backlog #1–#7 from product owner. (Update as fixed.)
- 2026-06-03 — Fixed #1 (Signal auto-join), #2 (chat ordering), #3 (read
  persistence + m.fully_read, safe portion), #4 (Status Broadcast excluded),
  #5 (OrionAI-side mute list), #7 (WhatsApp Matrix /sync real-time listener).
  #6 (WA Web UI/UX parity) in progress. Double-puppeting documented as the
  post-launch step for full phone-side #3/#5 parity.

---

## 6. Session 2026-06-03b — 5 new issues (Signal/WhatsApp polish)
All changes additive/surgical; no existing working functionality touched.

1. **Signal duplicate chats + self profile** — `signalMatrixService.js`.
   Stale/abandoned bridge portal rooms could surface the same contact twice
   (one live, one dead "Attachment no longer available"). Added
   `dedupeSignalRooms()` + `signalRoomIdentityKey()` (collapse direct rooms by
   phone/signal-id, fall back to normalized name; groups never collapsed) +
   `pickBetterSignalRoom()` (keep most-recent, content-bearing, non-placeholder
   room). Added `isSignalNoteToSelfRoom()` → tags the self-chat with
   `isSelf:true` BEFORE de-dupe so "Note to Self" is preserved and styleable.
   Applied in `listSignalRooms()` return. (Profile name/avatar itself is
   bridge-`remoteProfile`/matrix-profile data, already falls back to mxid
   localpart in `buildSignalStatusProfile`.)

2. **Signal input area now matches WhatsApp composer** — `SignalPage.vue`.
   Wrapped compose-top + footer in a new `.sg-composer-shell` (border-top +
   `rgba(7,12,22,0.78)` backdrop + `12px 18px 18px` padding, mirrors
   `.wa-composer-shell`). `.sg-compose` switched to a CSS grid
   (`auto auto minmax(0,1fr) auto`, gap 10, align-items:end) like `.wa-compose`;
   buttons 42x42; send button made circular (`border-radius:50%`, keeps Signal
   blue accent).

3. **Agent `whatsapp_reply_message` unknown tool** — `agentService.js`.
   Added `whatsapp_reply_message` to STATIC_TOOL_REGISTRY, a dispatch case
   routing it to `toolWhatsApp({action:"send"})` (reply == send, mirrors
   `telegram_reply_message`), `preflightMessagingSend` target resolution, the
   retry/error-handling tool list, AND a new "TYPE W — WHATSAPP" section in the
   classifier prompt enumerating the only valid whatsapp_* tools (prevents the
   LLM hallucinating tool names — the actual root cause).

4. **Notifications 1 min late -> instant** — `signalMatrixService.js` +
   `websocketServer.js`. Signal had NO real-time listener (only the 15s poll).
   Added `waitForSignalActivity(userId,{since,timeoutMs})` (single Matrix
   `/sync` long-poll returning `{nextBatch,hasNewActivity}`, mirrors
   `waitForWhatsAppActivity`) and `startSignalListener(userId)` +
   `signalListeners` Map (started on WS connect after the WhatsApp listener,
   stopped on last-tab disconnect, gated on Signal connection state, exp
   backoff). On new activity it now invalidates the 10s sync cache
   (`invalidateSignalCache`) before `refreshUserSignals`, so the triggered poll
   reads the brand-new message instead of stale cache. Same cache-bypass added
   to the existing WhatsApp listener (`invalidateWhatsAppCache`) — both apps now
   surface within ~1s instead of waiting on cache TTL + poll cadence.

5. **Clickable links in WhatsApp + Signal** — `WhatsAppPage.vue` +
   `SignalPage.vue`. Added a `linkifyText()` helper to each (HTML-escapes first,
   then wraps `https?://` / `www.` URLs in `<a target="_blank"
   rel="noopener noreferrer">`). Message text `<p>/<div>` now uses
   `v-html="linkifyText(message.text)"`. Added `.wa-link` / `.sg-link` styles
   (underlined accent, `word-break:break-all`). Safe: escape-before-linkify
   means only the anchors we build are ever rendered as HTML.

## 7. Session 2026-06-03c — 3 issues (Signal dup/profile, agent reply, sent-unread)
All changes additive/surgical; no existing working functionality touched.

1. **Signal duplicate chats + self profile (still existed)** —
   `signalMatrixService.js`. Root cause: the two fake "Vikas Verma" rooms were
   actually the single "Signal Note to Self" self-chat, mislabeled because
   `getRoomName` only read `state.events` while the bridge's `m.room.name` had
   landed in the `timeline.events` (lazy-load + incremental `/sync`). Fixes:
   (a) `getRoomName` now scans BOTH `state.events` and `timeline.events` for
   `m.room.name`, taking the latest by `origin_server_ts`. (b) `buildRoomDescriptor`
   detects Note-to-Self (`/note to self/i`), sets `name:"Note to Self"`,
   `isSelf:true`, and `selfProfileName` from the lone non-bot ghost member.
   (c) `signalRoomIdentityKey` returns `self:note-to-self` for `isSelf` rooms so
   the self-chat collapses to ONE entry; groups only collapse on byte-identical
   `dup:` keys. (d) Profile fallback: `buildSignalStatusProfile` gained a
   `selfProfileHint` param (used when the matrix name looks generic like
   "OrionAI"); `getSignalStatus` passes the self-room's name/avatar.
   Verified live: room list 4→3, profile now shows "Vikas Verma" + avatar.

2. **Agent sent literal placeholder reply** — `agentService.js`. When asked
   "Reply vikas on whatsapp for their recent message", the planner emitted a
   generic `message:"Replying to your recent message"` which template-substitution
   (`agentRuntimeContext.js`) never rewrote (no `{{}}`, non-empty), and
   `whatsapp_get_messages`'s `summary` is only "N messages from X" — useless as a
   reply. Fix: added `composeContextualReply(tool, params, results)` +
   `isPlaceholderReplyText()` + `extractRecentInboundContext()`, called in the
   `runAgent` loop right after `resolveRuntimeStep`. It ONLY activates for
   messaging/reply tools (`CONTEXTUAL_REPLY_TOOLS` set) AND only when the message
   is empty / unresolved `{{template}}` / a generic "replying to your message"
   placeholder — concrete planner-written messages pass through untouched. When it
   fires, it pulls the latest inbound message(s) from the preceding get_messages
   step and composes a real reply via `chatCompleteNoSystem`. Generic mechanism →
   applies to WhatsApp/Telegram/Slack/Signal reply skills alike.

3. **Newly sent message shows as unread in OrionAI** — `signalMatrixService.js`.
   Signal-only synthetic-unread fallback (`applySignalPortalReadState`) forced
   `unread=1` when bridge `unreadCount<=0` but `latestMessageTs > local read
   marker`. After sending, the bridge echo bumped `latestMessageTs` past the
   stored marker → own sent message rendered unread. Fix: advance the local read
   marker (`setSignalPortalReadMarker(userId, roomId, nowTs())`) immediately after
   a successful send in `sendSignalMessage` and `uploadSignalMedia`. WhatsApp is
   unaffected (it uses the bridge's `notification_count`, has no synthetic
   fallback).
