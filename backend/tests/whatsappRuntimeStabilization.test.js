"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  mergeConversationMetadata,
  DISPLAY_NAME_SOURCES,
  AVATAR_SOURCES,
} = require("../services/messaging/messagingConversationMetadata");
const {
  canonicalizeWhatsAppRemoteIdentity,
  summarizeWhatsAppPortalInventory,
  inventoryIsReady,
} = require("../services/messaging/whatsappPortalInventory");
const {
  selectReachableAvatar,
  mediaDownloadUrl,
  hydrateVerifiedConversationAvatars,
  __test: avatarTest,
} = require("../services/messaging/whatsappAvatarHydrationService");
const {
  normalizePortal,
} = require("../services/messaging/bridgePortalEvidenceSource");
const {
  runWhatsAppRuntimeSync,
  __test: runtimeTest,
} = require("../services/messaging/whatsappRuntimeSyncService");
const {
  __test: websocketTest,
} = require("../services/websocketServer");

test.afterEach(() => runtimeTest.resetRuntimeSyncStateForTests());

test("higher quality contact name survives a later phone fallback", () => {
  const result = mergeConversationMetadata(
    {
      displayName: "Vikas Verma",
      displayNameSource: DISPLAY_NAME_SOURCES.CONTACT_NAME,
    },
    {
      displayName: "+91 90000 00000",
      displayNameSource: DISPLAY_NAME_SOURCES.PHONE_FALLBACK,
    }
  );
  assert.equal(result.displayName, "Vikas Verma");
  assert.equal(result.displayNameSource, DISPLAY_NAME_SOURCES.CONTACT_NAME);
});

test("empty and lower ranked metadata cannot erase a stable name", () => {
  const result = mergeConversationMetadata(
    { displayName: "Customer", displayNameSource: "room_name" },
    { displayName: "", displayNameSource: "unknown" }
  );
  assert.equal(result.displayName, "Customer");
});

test("LID and phone aliases share one canonical remote conversation key", () => {
  const lid = canonicalizeWhatsAppRemoteIdentity({
    portalId: "masked@lid",
    // whatsmeow_lid_map stores bare user parts, not full JIDs.
    mappedLid: "masked",
    mappedPn: "phone",
  });
  const pn = canonicalizeWhatsAppRemoteIdentity({
    portalId: "phone@s.whatsapp.net",
    mappedLid: "masked",
    mappedPn: "phone",
  });
  assert.equal(lid.canonicalRemoteChatKey, pn.canonicalRemoteChatKey);
  assert.equal(lid.canonicalRemoteChatKey, "phone@s.whatsapp.net");
  assert.deepEqual(lid.aliasRemoteChatIds, [
    "masked@lid",
    "phone@s.whatsapp.net",
  ]);
});

test("a LID-only direct chat remains eligible instead of becoming an unexplained portal", () => {
  const identity = canonicalizeWhatsAppRemoteIdentity({ portalId: "masked@lid" });
  assert.equal(identity.identityAmbiguous, false);
  assert.equal(identity.canonicalRemoteChatKey, "masked@lid");
});

test("WhatsApp zero identity is a terminal system record, not a user chat", () => {
  const summary = summarizeWhatsAppPortalInventory({
    portals: [{
      portalId: "0@s.whatsapp.net",
      receiver: "login",
      canonicalRemoteChatKey: "0@s.whatsapp.net",
      remoteChatType: "system",
    }],
  });
  assert.equal(summary.eligibleConversationCount, 0);
  assert.equal(summary.ignoredCount, 1);
  assert.equal(summary.pendingConversationCount, 0);
  assert.equal(inventoryIsReady(summary), true);
});

test("READY requires every eligible portal to be verified with no pending work", () => {
  const summary = summarizeWhatsAppPortalInventory({
    portals: [
      {
        portalId: "one@s.whatsapp.net",
        receiver: "login",
        canonicalRemoteChatKey: "one@s.whatsapp.net",
        remoteChatType: "dm",
        roomId: "!one:orion.local",
      },
      {
        portalId: "two@g.us",
        receiver: "login",
        canonicalRemoteChatKey: "two@g.us",
        remoteChatType: "group",
        roomId: "",
      },
      {
        portalId: "status@broadcast",
        receiver: "login",
        canonicalRemoteChatKey: "status@broadcast",
        remoteChatType: "status",
      },
    ],
    verifiedRoomIds: new Set(["!one:orion.local"]),
    joinedRoomIds: new Set(["!one:orion.local"]),
  });
  assert.equal(summary.discoveredPortalCount, 3);
  assert.equal(summary.eligibleConversationCount, 2);
  assert.equal(summary.verifiedConversationCount, 1);
  assert.equal(summary.pendingConversationCount, 1);
  assert.equal(summary.ignoredCount, 1);
  assert.equal(inventoryIsReady(summary), false);
});

test("history conversations without portals keep runtime sync out of READY", () => {
  const combined = runtimeTest.combineInventoryWithHistory(
    {
      discoveredPortalCount: 23,
      eligibleConversationCount: 23,
      verifiedConversationCount: 23,
      pendingConversationCount: 0,
      failedCount: 0,
    },
    {
      conversationCount: 52,
      remoteEligibleConversationCount: 52,
      pendingPortalCount: 29,
      unprocessedCount: 29,
    },
    23
  );
  assert.equal(combined.eligibleConversationCount, 52);
  assert.equal(combined.pendingConversationCount, 29);
  assert.equal(inventoryIsReady(combined), false);
});

test("duplicate LID/JID alias is terminal and not counted twice as eligible", () => {
  const portals = ["masked@lid", "masked@s.whatsapp.net"].map((portalId) => ({
    portalId,
    receiver: "login",
    canonicalRemoteChatKey: "masked@s.whatsapp.net",
    remoteChatType: "dm",
    roomId: "",
  }));
  const summary = summarizeWhatsAppPortalInventory({ portals });
  assert.equal(summary.duplicateCount, 1);
  assert.equal(summary.eligibleConversationCount, 1);
  assert.equal(summary.discoveredPortalCount, 2);
});

test("avatar hydration rejects stale MXC and selects the next valid source", async () => {
  const selected = await selectReachableAvatar({
    homeserverUrl: "http://127.0.0.1:18008",
    accessToken: "redacted",
    candidates: [
      { avatarMxc: "mxc://orion.local/stale", avatarSource: AVATAR_SOURCES.PORTAL },
      { avatarMxc: "mxc://orion.local/current", avatarSource: AVATAR_SOURCES.GHOST },
    ],
    reachabilityCheck: async ({ mxc }) => ({
      reachable: mxc.endsWith("/current"),
      status: mxc.endsWith("/current") ? 200 : 404,
    }),
  });
  assert.equal(selected.avatarMxc, "mxc://orion.local/current");
  assert.equal(selected.avatarSource, AVATAR_SOURCES.GHOST);
  assert.equal(selected.avatarState, "available");
  const mediaUrl = new URL(
    mediaDownloadUrl("http://127.0.0.1:18008", selected.avatarMxc)
  );
  assert.equal(mediaUrl.port, "18008");
});

test("LID and phone ghost avatar candidates are retained for one portal", () => {
  const portal = normalizePortal("whatsapp", {
    bridge_id: "whatsapp",
    login_id: "login-a",
    user_mxid: "@orion_u_test_whatsapp:orion.local",
    portal_id: "masked@lid",
    portal_receiver: "login-a",
    room_id: "!room:orion.local",
    room_type: "dm",
    mapped_lid: "masked@lid",
    mapped_pn: "masked@s.whatsapp.net",
    ghost_avatar_mxc: "mxc://orion.local/stale",
    ghost_avatar_mxcs: [
      "mxc://orion.local/stale",
      "mxc://orion.local/current",
    ],
  });
  assert.deepEqual(
    portal.avatarCandidates.map((candidate) => candidate.avatarMxc),
    ["mxc://orion.local/stale", "mxc://orion.local/current"]
  );
});

test("direct portal avatar hydration checks the exact WhatsApp ghost profile", async () => {
  const updates = [];
  const matrixUserId = "@orion_u_test_whatsapp:orion.local";
  const portal = {
    roomId: "!room:orion.local",
    portalId: "masked@lid",
    otherUserId: "lid-masked",
    remoteChatType: "dm",
    avatarCandidates: [],
  };
  assert.deepEqual(
    avatarTest.whatsappGhostMxidsForPortal(portal, matrixUserId),
    ["@whatsapp_lid-masked:orion.local"]
  );
  const summary = await hydrateVerifiedConversationAvatars({
    userId: "user-a",
    connection: { matrixUserId },
    portals: [portal],
    mappings: [{ matrixRoomId: portal.roomId }],
    repository: {
      async updateConversationMetadata(update) {
        updates.push(update);
      },
    },
    sessionResolver: async () => ({
      homeserverUrl: "http://127.0.0.1:18008",
      accessToken: "redacted",
    }),
    roomAvatarLoader: async () => null,
    ghostAvatarLoader: async () => [{
      avatarMxc: "mxc://orion.local/current",
      avatarSource: AVATAR_SOURCES.GHOST,
    }],
    reachabilityCheck: async () => ({ reachable: true, status: 200 }),
  });
  assert.equal(summary.available, 1);
  assert.equal(updates[0].avatarMxc, "mxc://orion.local/current");
  assert.equal(updates[0].avatarState, "available");
});

test("joined-member avatar discovery excludes the authenticated account ghost", () => {
  const candidates = avatarTest.whatsappGhostMxidsFromJoinedMembers(
    {
      "@whatsapp_contact:orion.local": {},
      "@whatsapp_owner:orion.local": {},
      "@signal_contact:orion.local": {},
      "@orion_u_test_whatsapp:orion.local": {},
    },
    {
      matrixUserId: "@orion_u_test_whatsapp:orion.local",
      ownGhostMxid: "@whatsapp_owner:orion.local",
    }
  );
  assert.deepEqual(candidates, ["@whatsapp_contact:orion.local"]);
});

test("room-state avatar discovery uses joined WhatsApp ghosts only", () => {
  const candidates = avatarTest.whatsappGhostMxidsFromRoomState(
    [
      { type: "m.room.member", state_key: "@whatsapp_contact:orion.local", content: { membership: "join" } },
      { type: "m.room.member", state_key: "@whatsapp_left:orion.local", content: { membership: "leave" } },
      { type: "m.room.member", state_key: "@signal_contact:orion.local", content: { membership: "join" } },
    ],
    { matrixUserId: "@orion_u_test_whatsapp:orion.local" }
  );
  assert.deepEqual(candidates, ["@whatsapp_contact:orion.local"]);
});

test("group avatar hydration removes a participant ghost fallback", async () => {
  const updates = [];
  await hydrateVerifiedConversationAvatars({
    userId: "user-a",
    connection: { matrixUserId: "@orion_u_test_whatsapp:orion.local" },
    portals: [{
      roomId: "!group:orion.local",
      remoteChatType: "group",
      avatarCandidates: [],
    }],
    mappings: [{
      matrixRoomId: "!group:orion.local",
      type: "group",
      avatarMxc: "mxc://orion.local/participant",
      avatarSource: AVATAR_SOURCES.GHOST,
      avatarState: "available",
    }],
    repository: {
      async updateConversationMetadata(update) {
        updates.push(update);
      },
    },
    sessionResolver: async () => ({
      homeserverUrl: "http://127.0.0.1:18008",
      accessToken: "redacted",
    }),
    roomAvatarLoader: async () => null,
    ghostAvatarLoader: async () => [],
    reachabilityCheck: async () => ({ reachable: false, status: 404 }),
  });
  assert.equal(updates[0].avatarMxc, "");
  assert.equal(updates[0].authoritativeAvatarRemoval, true);
});

test("authoritative missing avatar uses initials without erasing a usable avatar accidentally", () => {
  const preserved = mergeConversationMetadata(
    {
      avatarMxc: "mxc://orion.local/current",
      avatarSource: AVATAR_SOURCES.GHOST,
      avatarState: "available",
    },
    { avatarMxc: "", avatarSource: "none", avatarState: "missing" }
  );
  assert.equal(preserved.avatarMxc, "mxc://orion.local/current");
  const removed = mergeConversationMetadata(
    preserved,
    {
      avatarMxc: "",
      avatarSource: "none",
      avatarState: "broken",
      authoritativeAvatarRemoval: true,
    }
  );
  assert.equal(removed.avatarMxc, "");
});

test("validated ghost avatar replaces an unvalidated stale portal candidate", () => {
  const merged = mergeConversationMetadata(
    {
      avatarMxc: "mxc://orion.local/stale-portal",
      avatarSource: AVATAR_SOURCES.PORTAL,
      avatarState: "unknown",
    },
    {
      avatarMxc: "mxc://orion.local/working-ghost",
      avatarSource: AVATAR_SOURCES.GHOST,
      avatarState: "available",
    }
  );
  assert.equal(merged.avatarMxc, "mxc://orion.local/working-ghost");
  assert.equal(merged.avatarSource, AVATAR_SOURCES.GHOST);
  assert.equal(merged.avatarState, "available");
});

test("unvalidated high-rank avatar cannot replace validated media", () => {
  const merged = mergeConversationMetadata(
    {
      avatarMxc: "mxc://orion.local/working-ghost",
      avatarSource: AVATAR_SOURCES.GHOST,
      avatarState: "available",
    },
    {
      avatarMxc: "mxc://orion.local/unknown-portal",
      avatarSource: AVATAR_SOURCES.PORTAL,
      avatarState: "unknown",
    }
  );
  assert.equal(merged.avatarMxc, "mxc://orion.local/working-ghost");
  assert.equal(merged.avatarSource, AVATAR_SOURCES.GHOST);
  assert.equal(merged.avatarState, "available");
});

test("post-connect runtime sync upserts connection, applies reconciliation, and reaches READY", async () => {
  const updates = [];
  const connection = {
    _id: "connection-a",
    userId: "user-a",
    provider: "whatsapp",
    syncStartedAt: new Date(),
  };
  const status = await runWhatsAppRuntimeSync("user-a", {
    integrationModel: {
      async findOne() {
        return {
          _id: "integration-a",
          userId: "user-a",
          type: "whatsapp",
          matrix: {
            mxid: "@orion_u_user-a_whatsapp:orion.local",
            loginState: "connected",
            bridgeBotMxid: "@whatsappbot:orion.local",
          },
          whatsapp: { connected: true },
        };
      },
    },
    accountStateLoader: async () => ({
      connected: true,
      userLoginId: "login-a",
      login: { state_event: "CONNECTED" },
    }),
    connectionRepo: {
      async upsertConnection(patch) {
        updates.push(patch);
        return { ...connection, ...patch };
      },
      async updateConnectionSync(patch) {
        updates.push(patch);
        return { ...connection, ...patch };
      },
    },
    conversationRepo: {
      async listVerifiedConversationsForConnection() {
        return [{ matrixRoomId: "!one:orion.local" }];
      },
    },
    portalEvidenceLoader: async () => ({
      portals: [{
        portalId: "one@s.whatsapp.net",
        receiver: "login-a",
        canonicalRemoteChatKey: "one@s.whatsapp.net",
        remoteChatType: "dm",
        roomId: "!one:orion.local",
      }],
    }),
    sessionResolver: async () => ({
      homeserverUrl: "http://127.0.0.1:18008",
      accessToken: "redacted",
    }),
    membershipEnsurer: async () => ({ joined: 0 }),
    avatarSelector: async () => ({
      avatarMxc: "",
      avatarSource: "none",
      avatarState: "missing",
      avatarUpdatedAt: new Date(),
    }),
    avatarHydrator: async () => ({ available: 0, missing: 1, broken: 0 }),
    reconcile: async ({ dryRun }) => {
      assert.equal(dryRun, false);
      return { verified: 1, conflict: 0, errors: [] };
    },
  });

  assert.equal(updates[0].userLoginId, "login-a");
  assert.equal(status.state, "READY");
  assert.equal(status.portalCount, 1);
  assert.equal(status.verifiedCount, 1);
});

test("disconnected remote login stops before reconciliation", async () => {
  let reconcileCalled = false;
  const status = await runWhatsAppRuntimeSync("user-a", {
    integrationModel: {
      async findOne() {
        return {
          _id: "integration-a",
          userId: "user-a",
          type: "whatsapp",
          matrix: { mxid: "@user:orion.local" },
          whatsapp: {},
        };
      },
    },
    accountStateLoader: async () => ({ connected: false }),
    connectionRepo: {
      async upsertConnection(patch) {
        return { _id: "connection-a", ...patch };
      },
    },
    reconcile: async () => {
      reconcileCalled = true;
    },
  });
  assert.equal(reconcileCalled, false);
  assert.equal(status.state, "ACTION_REQUIRED");
});

test("eligible null-mxid portal triggers bridge-owned creation and remains syncing", async () => {
  let createCalls = 0;
  const connection = { _id: "connection-a", syncStartedAt: new Date() };
  const status = await runWhatsAppRuntimeSync("user-a", {
    integrationModel: {
      async findOne() {
        return {
          _id: "integration-a",
          userId: "user-a",
          type: "whatsapp",
          matrix: { mxid: "@user:orion.local" },
          whatsapp: { connected: true },
        };
      },
    },
    accountStateLoader: async () => ({ connected: true, userLoginId: "login-a" }),
    connectionRepo: {
      async upsertConnection(patch) { return { ...connection, ...patch }; },
      async updateConnectionSync(patch) { return { ...connection, ...patch }; },
    },
    conversationRepo: {
      async listVerifiedConversationsForConnection() { return []; },
    },
    portalEvidenceLoader: async () => ({
      portals: [{
        portalId: "masked@lid",
        receiver: "login-a",
        loginId: "login-a",
        portalFingerprint: "abcdef12",
        canonicalRemoteChatKey: "masked@lid",
        remoteChatType: "dm",
        roomId: "",
      }],
    }),
    portalCreator: async () => {
      createCalls += 1;
      return { attempted: true };
    },
    reconcile: async () => ({ verified: 0, conflict: 0, errors: [] }),
    sessionResolver: async () => ({ homeserverUrl: "http://new", accessToken: "redacted" }),
    membershipEnsurer: async () => ({ joined: 0 }),
    avatarSelector: async () => ({
      avatarMxc: "",
      avatarSource: "none",
      avatarState: "missing",
      avatarUpdatedAt: new Date(),
    }),
    avatarHydrator: async () => ({}),
  });
  assert.equal(createCalls, 1);
  assert.equal(status.state, "CONNECTED_SYNCING");
  assert.equal(status.pendingConversationCount, 1);
  assert.equal(status.eligibleConversationCount, 1);
});

test("runtime membership joins only invited rooms owned by the WhatsApp login", async () => {
  const posted = [];
  const result = await runtimeTest.ensureInvitedWhatsAppPortalMemberships({
    connection: { bridgeAppserviceId: "whatsapp" },
    portals: [
      {
        bridgeId: "whatsapp",
        portalId: "masked@s.whatsapp.net",
        remoteChatType: "dm",
        roomId: "!owned:orion.local",
      },
      {
        bridgeId: "signal",
        portalId: "signal-user",
        remoteChatType: "dm",
        roomId: "!signal:orion.local",
      },
      {
        bridgeId: "whatsapp",
        portalId: "status@broadcast",
        remoteChatType: "status",
        roomId: "!status:orion.local",
      },
    ],
    session: { homeserverUrl: "http://new", accessToken: "redacted" },
    httpClient: {
      async get() {
        return {
          status: 200,
          data: {
            rooms: {
              invite: {
                "!owned:orion.local": {},
                "!signal:orion.local": {},
                "!status:orion.local": {},
                "!random:orion.local": {},
              },
            },
          },
        };
      },
      async post(url) {
        posted.push(url);
        return { status: 200, data: { room_id: "!owned:orion.local" } };
      },
    },
  });
  assert.equal(result.joined, 1);
  assert.equal(posted.length, 1);
  assert.match(posted[0], /owned/);
  assert.doesNotMatch(posted[0], /signal|status|random/);
});

test("incoming verified Matrix event is routed only to its owning user", async () => {
  const pushed = [];
  const metadataUpdates = [];
  const routed = await websocketTest.routeVerifiedWhatsAppActivity({
    userId: "user-a",
    activity: { roomId: "!wa:orion.local", eventId: "$incoming" },
    authorize: async ({ userId, provider, roomId }) => {
      assert.equal(userId, "user-a");
      assert.equal(provider, "whatsapp");
      assert.equal(roomId, "!wa:orion.local");
      return { conversation: { matrixRoomId: roomId } };
    },
    getTimeline: async () => ({
      room: { title: "Verified room", avatarMxc: "mxc://orion/avatar" },
      messages: [
        {
          id: "$incoming",
          roomId: "!wa:orion.local",
          direction: "inbound",
          text: "transient only",
          timestamp: "2026-08-23T00:00:00.000Z",
        },
      ],
    }),
    conversationRepo: {
      async updateConversationMetadata(patch) {
        metadataUpdates.push(patch);
      },
    },
    push(userId, payload) {
      pushed.push({ userId, payload });
    },
  });
  assert.equal(routed, true);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].userId, "user-a");
  assert.equal(pushed[0].payload.eventId, "$incoming");
  assert.equal(metadataUpdates.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(metadataUpdates[0], "text"), false);
});

test("unverified realtime activity fails closed without emitting", async () => {
  let pushed = false;
  await assert.rejects(() =>
    websocketTest.routeVerifiedWhatsAppActivity({
      userId: "user-a",
      activity: { roomId: "!signal:orion.local", eventId: "$event" },
      authorize: async () => {
        throw new Error("not verified for WhatsApp");
      },
      getTimeline: async () => ({ messages: [] }),
      conversationRepo: { async updateConversationMetadata() {} },
      push() {
        pushed = true;
      },
    })
  );
  assert.equal(pushed, false);
});
