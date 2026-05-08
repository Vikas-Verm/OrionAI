"use strict";

const {
  CONVERSATION_STATES,
  CONVERSATION_STATE_META,
  ACTION_STATES,
  ACTION_STATE_META,
  ACTION_STATE_BY_CONVERSATION_STATE,
  CONVERSATION_STATE_BY_ACTION_STATE,
} = require("./communicationActionConfig");

const QUICK_ACTIONS = {
  HANDLED: "handled",
  SNOOZED: "snoozed",
  DISMISSED: "dismissed",
  RECLASSIFIED: "reclassified",
};

const QUICK_ACTION_LABELS = {
  [QUICK_ACTIONS.HANDLED]: "Handled",
  [QUICK_ACTIONS.SNOOZED]: "Snoozed",
  [QUICK_ACTIONS.DISMISSED]: "Dismissed",
  [QUICK_ACTIONS.RECLASSIFIED]: "Reclassified",
};

const QUICK_ACTION_ALIASES = {
  approve: QUICK_ACTIONS.HANDLED,
  approved: QUICK_ACTIONS.HANDLED,
  edited_approve: QUICK_ACTIONS.HANDLED,
  edited_approved: QUICK_ACTIONS.HANDLED,
  done: QUICK_ACTIONS.HANDLED,
  mark_done: QUICK_ACTIONS.HANDLED,
  handle: QUICK_ACTIONS.HANDLED,
  handled: QUICK_ACTIONS.HANDLED,
  snooze: QUICK_ACTIONS.SNOOZED,
  snoozed: QUICK_ACTIONS.SNOOZED,
  dismiss: QUICK_ACTIONS.DISMISSED,
  dismissed: QUICK_ACTIONS.DISMISSED,
  reclassify: QUICK_ACTIONS.RECLASSIFIED,
  reclassified: QUICK_ACTIONS.RECLASSIFIED,
};

const ACTIONABLE_STATES = new Set([
  CONVERSATION_STATES.WAITING_ON_YOU,
  CONVERSATION_STATES.NEEDS_APPROVAL,
  CONVERSATION_STATES.NEEDS_FOLLOW_UP,
  CONVERSATION_STATES.WAITING_ON_OTHERS,
]);

const TERMINAL_STATES = new Set([
  CONVERSATION_STATES.RESOLVED,
  CONVERSATION_STATES.NO_ACTION_NEEDED,
]);

const ALLOWED_TRANSITIONS = {
  [QUICK_ACTIONS.HANDLED]: {
    from: ACTIONABLE_STATES,
    to: CONVERSATION_STATES.RESOLVED,
  },
  [QUICK_ACTIONS.SNOOZED]: {
    from: ACTIONABLE_STATES,
    to: null,
  },
  [QUICK_ACTIONS.DISMISSED]: {
    from: new Set([
      ...ACTIONABLE_STATES,
      CONVERSATION_STATES.RESOLVED,
    ]),
    to: CONVERSATION_STATES.NO_ACTION_NEEDED,
  },
  [QUICK_ACTIONS.RECLASSIFIED]: {
    from: new Set([
      ...ACTIONABLE_STATES,
      ...TERMINAL_STATES,
    ]),
    to: null,
  },
};

const RECLASSIFY_TARGETS = new Set([
  CONVERSATION_STATES.WAITING_ON_YOU,
  CONVERSATION_STATES.NEEDS_APPROVAL,
  CONVERSATION_STATES.NEEDS_FOLLOW_UP,
  CONVERSATION_STATES.WAITING_ON_OTHERS,
  CONVERSATION_STATES.RESOLVED,
  CONVERSATION_STATES.NO_ACTION_NEEDED,
]);

const SNOOZE_MIN_MINUTES = 15;
const SNOOZE_MAX_MINUTES = 7 * 24 * 60;
const SNOOZE_DEFAULT_MINUTES = 120;

const COMMUNICATION_ITEM_PREFIX = "comm";

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function buildCanonicalConversationKey(sourceApp = "", conversationId = "") {
  const source = String(sourceApp || "").trim().toLowerCase();
  const conv = String(conversationId || "").trim();
  if (!source || !conv) return null;
  return `${COMMUNICATION_ITEM_PREFIX}:${source}:${conv}`;
}

function parseCanonicalConversationKey(itemId = "") {
  const value = String(itemId || "").trim();
  if (!value) return null;
  const parts = value.split(":");
  if (parts[0] !== COMMUNICATION_ITEM_PREFIX || parts.length < 3) return null;
  const sourceApp = parts[1];
  const conversationId = parts.slice(2).join(":");
  if (!sourceApp || !conversationId) return null;
  return { sourceApp, conversationId };
}

function normalizeQuickAction(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return QUICK_ACTION_ALIASES[normalized] || null;
}

function normalizeConversationState(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (CONVERSATION_STATE_META[normalized]) return normalized;
  if (CONVERSATION_STATE_BY_ACTION_STATE[normalized]) {
    return CONVERSATION_STATE_BY_ACTION_STATE[normalized];
  }
  return null;
}

function normalizeActionState(value = "") {
  const conversationState = normalizeConversationState(value);
  if (conversationState) {
    return ACTION_STATE_BY_CONVERSATION_STATE[conversationState];
  }
  const direct = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ACTION_STATE_META[direct] ? direct : null;
}

function clampSnoozeMinutes(minutes) {
  return clamp(minutes || SNOOZE_DEFAULT_MINUTES, SNOOZE_MIN_MINUTES, SNOOZE_MAX_MINUTES);
}

function buildTransitionReason(action, fromState, toState, providedReason = "") {
  const reason = String(providedReason || "").trim();
  if (reason) return reason;

  if (action === QUICK_ACTIONS.HANDLED) {
    return "Marked handled by user — moved to resolved.";
  }
  if (action === QUICK_ACTIONS.DISMISSED) {
    return "Dismissed by user — no action needed.";
  }
  if (action === QUICK_ACTIONS.SNOOZED) {
    return "Snoozed by user — will resurface after the snooze window.";
  }
  if (action === QUICK_ACTIONS.RECLASSIFIED) {
    const fromLabel = CONVERSATION_STATE_META[fromState]?.label || fromState || "previous state";
    const toLabel = CONVERSATION_STATE_META[toState]?.label || toState || "new state";
    return `Reclassified by user from "${fromLabel}" to "${toLabel}".`;
  }
  return "";
}

function applyQuickAction({
  fromState = "",
  fromActionState = "",
  action = "",
  targetState = "",
  targetActionState = "",
  snoozeMinutes = null,
  reason = "",
  nowMs = Date.now(),
} = {}) {
  const canonicalAction = normalizeQuickAction(action);
  if (!canonicalAction) {
    const allowed = Object.values(QUICK_ACTIONS).join(", ");
    throw new Error(`Unsupported quick action "${action}". Allowed: ${allowed}.`);
  }

  const fromConversationState =
    normalizeConversationState(fromState) ||
    normalizeConversationState(fromActionState) ||
    null;

  const transition = ALLOWED_TRANSITIONS[canonicalAction];
  if (
    fromConversationState &&
    transition.from instanceof Set &&
    !transition.from.has(fromConversationState)
  ) {
    throw new Error(
      `Action "${canonicalAction}" is not allowed from state "${fromConversationState}".`
    );
  }

  let toConversationState = transition.to;
  if (canonicalAction === QUICK_ACTIONS.RECLASSIFIED) {
    const target =
      normalizeConversationState(targetState) ||
      normalizeConversationState(targetActionState);
    if (!target || !RECLASSIFY_TARGETS.has(target)) {
      throw new Error(
        `Reclassify requires a valid targetState. Allowed: ${[...RECLASSIFY_TARGETS].join(", ")}.`
      );
    }
    toConversationState = target;
  }

  if (canonicalAction === QUICK_ACTIONS.SNOOZED) {
    toConversationState = fromConversationState || null;
  }

  const toActionState = toConversationState
    ? ACTION_STATE_BY_CONVERSATION_STATE[toConversationState]
    : null;

  const snoozedUntil =
    canonicalAction === QUICK_ACTIONS.SNOOZED
      ? new Date(nowMs + clampSnoozeMinutes(snoozeMinutes) * 60000)
      : null;

  return {
    action: canonicalAction,
    fromState: fromConversationState,
    fromActionState: fromConversationState
      ? ACTION_STATE_BY_CONVERSATION_STATE[fromConversationState]
      : null,
    toState: toConversationState,
    toActionState,
    snoozedUntil,
    reason: buildTransitionReason(
      canonicalAction,
      fromConversationState,
      toConversationState,
      reason
    ),
  };
}

function getQuickActionsForState(state) {
  const conversationState =
    normalizeConversationState(state) || CONVERSATION_STATES.NO_ACTION_NEEDED;

  const actions = [];
  for (const action of Object.values(QUICK_ACTIONS)) {
    const transition = ALLOWED_TRANSITIONS[action];
    if (transition.from instanceof Set && !transition.from.has(conversationState)) {
      continue;
    }
    actions.push({
      action,
      label: QUICK_ACTION_LABELS[action],
    });
  }
  return actions;
}

module.exports = {
  QUICK_ACTIONS,
  QUICK_ACTION_LABELS,
  QUICK_ACTION_ALIASES,
  ALLOWED_TRANSITIONS,
  RECLASSIFY_TARGETS,
  ACTIONABLE_STATES,
  TERMINAL_STATES,
  SNOOZE_MIN_MINUTES,
  SNOOZE_MAX_MINUTES,
  SNOOZE_DEFAULT_MINUTES,
  COMMUNICATION_ITEM_PREFIX,
  buildCanonicalConversationKey,
  parseCanonicalConversationKey,
  normalizeQuickAction,
  normalizeConversationState,
  normalizeActionState,
  clampSnoozeMinutes,
  buildTransitionReason,
  applyQuickAction,
  getQuickActionsForState,
};
