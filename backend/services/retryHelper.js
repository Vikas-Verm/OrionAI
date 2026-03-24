"use strict";

/**
 * Retry an async function with exponential backoff.
 *
 * Usage:
 *   const result = await withRetry(() => gmail.users.messages.list(...), {
 *     retries: 3,
 *     label: "Gmail list",
 *   });
 */
async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseDelay = 800, // ms
    maxDelay = 8000, // ms
    label = "operation",
    shouldRetry = (err) => {
      // Retry on network errors and rate limits, not on auth errors
      if (!err) return false;
      const status = err.response?.status || err.code;
      if (status === 401 || status === 403) return false; // auth error — don't retry
      if (status === 404) return false; // not found — don't retry
      return true; // retry everything else
    },
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === retries || !shouldRetry(err)) {
        throw err;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 200;
      console.warn(
        `[Retry] ${label} failed (attempt ${attempt + 1}/${
          retries + 1
        }), retrying in ${Math.round(delay)}ms:`,
        err.message
      );
      await sleep(delay + jitter);
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Wrap a tool function with retry ──────────────────────────────────────
function makeRetryable(fn, label, retries = 2) {
  return async function (...args) {
    return withRetry(() => fn(...args), { retries, label });
  };
}

module.exports = { withRetry, makeRetryable, sleep };
