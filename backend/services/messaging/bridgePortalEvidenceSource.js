"use strict";

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const {
  MATRIX_MESSAGING_PROVIDERS,
} = require("./messagingConstants");
const {
  DISPLAY_NAME_SOURCES,
  AVATAR_SOURCES,
  pickDisplayNameCandidate,
} = require("./messagingConversationMetadata");
const {
  classifyWhatsAppPortalType,
  canonicalizeWhatsAppRemoteIdentity,
  fingerprintPortal,
  markDuplicateAliases,
} = require("./whatsappPortalInventory");

const pools = new Map();

function normalizeString(value = "") {
  return String(value || "").trim();
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function configPathForProvider(provider = "") {
  if (provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP) {
    return path.resolve(__dirname, "../../../infra/mautrix-whatsapp/config.yaml");
  }
  if (provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL) {
    return path.resolve(__dirname, "../../../infra/mautrix-signal/config.yaml");
  }
  return "";
}

function readPostgresUriFromConfig(provider = "") {
  const configPath = configPathForProvider(provider);
  if (!configPath || !fs.existsSync(configPath)) return "";
  const contents = fs.readFileSync(configPath, "utf8");
  const match = contents.match(/^\s*uri:\s*(postgres:\/\/[^\s#]+)\s*$/m);
  if (!match) return "";
  return String(match[1] || "")
    .replace("@postgres/", "@localhost:5433/")
    .trim();
}

function postgresUriForProvider(provider = "") {
  if (provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP) {
    return (
      normalizeString(process.env.MAUTRIX_WHATSAPP_PG_URI) ||
      readPostgresUriFromConfig(provider)
    );
  }
  if (provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL) {
    return (
      normalizeString(
        process.env.MAUTRIX_SIGNAL_PG_URI || process.env.SIGNAL_BRIDGE_PG_URI
      ) || readPostgresUriFromConfig(provider)
    );
  }
  return "";
}

function getPool(provider = "") {
  const uri = postgresUriForProvider(provider);
  if (!uri) return null;
  const key = `${provider}:${uri}`;
  if (pools.has(key)) return pools.get(key);
  const pool = new Pool({
    connectionString: uri,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000,
  });
  pools.set(key, pool);
  return pool;
}

function normalizeRoomType(provider = "", portal = {}) {
  const roomType = normalizeString(portal.roomType).toLowerCase();
  const portalId = normalizeString(portal.portalId).toLowerCase();
  if (provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP) {
    if (portalId === "status@broadcast" || portalId.includes("broadcast")) {
      return "broadcast";
    }
    if (portalId.endsWith("@g.us") || roomType.includes("group")) return "group";
    if (roomType.includes("dm") || roomType.includes("private")) return "direct";
    return "unknown";
  }
  if (roomType.includes("group")) return "group";
  if (roomType.includes("dm") || roomType.includes("private")) return "direct";
  return "unknown";
}

function normalizePortal(provider = "", row = {}) {
  const remoteProfile = safeJsonParse(row.remote_profile, {});
  const metadata = safeJsonParse(row.metadata, {});
  const portalName = normalizeString(row.portal_name || row.name);
  const selectedName = pickDisplayNameCandidate([
    {
      displayName: row.contact_name,
      displayNameSource: DISPLAY_NAME_SOURCES.CONTACT_NAME,
    },
    {
      displayName: row.business_name,
      displayNameSource: DISPLAY_NAME_SOURCES.BUSINESS_NAME,
    },
    {
      displayName: portalName,
      displayNameSource: /^\+?[\d\s().-]+$/.test(portalName)
        ? DISPLAY_NAME_SOURCES.PHONE_FALLBACK
        : DISPLAY_NAME_SOURCES.ROOM_NAME,
    },
    {
      displayName: row.push_name || row.profile_name,
      displayNameSource: DISPLAY_NAME_SOURCES.PUSH_NAME,
    },
    {
      displayName: row.ghost_name,
      displayNameSource: DISPLAY_NAME_SOURCES.GHOST_NAME,
    },
  ]);
  const remoteIdentity = provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP
    ? canonicalizeWhatsAppRemoteIdentity({
        portalId: row.portal_id,
        mappedLid: row.mapped_lid,
        mappedPn: row.mapped_pn,
      })
    : {
        canonicalRemoteChatKey: normalizeString(row.other_user_id || row.portal_id),
        aliasRemoteChatIds: [],
        identityAmbiguous: false,
      };
  const portalAvatarMxc = normalizeString(row.portal_avatar_mxc || row.avatar_mxc);
  const ghostAvatarMxcs = [
    ...new Set(
      [row.ghost_avatar_mxc, ...(row.ghost_avatar_mxcs || [])]
        .map((value) => normalizeString(value))
        .filter(Boolean)
    ),
  ];
  const ghostAvatarMxc = ghostAvatarMxcs[0] || "";
  const portal = {
    provider,
    bridgeId: normalizeString(row.bridge_id),
    loginId: normalizeString(row.login_id),
    userMxid: normalizeString(row.user_mxid),
    remoteAccountId: normalizeString(
      remoteProfile.phone || metadata.phone || row.remote_name
    ),
    remoteAccountDisplay: normalizeString(
      remoteProfile.name || metadata.name || row.remote_name
    ),
    roomId: normalizeString(row.room_id),
    portalId: normalizeString(row.portal_id),
    receiver: normalizeString(row.portal_receiver),
    otherUserId: normalizeString(row.other_user_id),
    portalFingerprint: fingerprintPortal(row.portal_id, row.portal_receiver),
    canonicalRemoteChatKey: remoteIdentity.canonicalRemoteChatKey,
    aliasRemoteChatIds: remoteIdentity.aliasRemoteChatIds,
    identityAmbiguous: remoteIdentity.identityAmbiguous,
    name: selectedName.displayName,
    nameSource: selectedName.displayNameSource,
    nameRank: selectedName.displayNameRank,
    avatarMxc: portalAvatarMxc || ghostAvatarMxc,
    avatarSource: portalAvatarMxc
      ? AVATAR_SOURCES.PORTAL
      : ghostAvatarMxc
        ? AVATAR_SOURCES.GHOST
        : AVATAR_SOURCES.NONE,
    avatarCandidates: [
      ...(portalAvatarMxc
        ? [{ avatarMxc: portalAvatarMxc, avatarSource: AVATAR_SOURCES.PORTAL }]
        : []),
      ...ghostAvatarMxcs.map((avatarMxc) => ({
        avatarMxc,
        avatarSource: AVATAR_SOURCES.GHOST,
      })),
    ],
    roomType: normalizeString(row.room_type),
    preferred: Boolean(row.preferred),
    userPortalInSpace: Boolean(row.user_in_space),
  };
  portal.type = normalizeRoomType(provider, portal);
  if (provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP) {
    portal.remoteChatType = classifyWhatsAppPortalType(
      portal.portalId,
      portal.roomType
    );
  }
  return portal;
}

async function readWhatsAppPortalEvidence(connection = {}) {
  const pool = getPool(MATRIX_MESSAGING_PROVIDERS.WHATSAPP);
  const matrixUserId = normalizeString(connection.matrixUserId);
  if (!pool || !matrixUserId) return { provider: "whatsapp", portals: [] };
  const { rows } = await pool.query(
    `
      SELECT
        ul.user_mxid,
        ul.id AS login_id,
        ul.remote_name,
        ul.remote_profile,
        ul.metadata,
        up.bridge_id,
        up.portal_id,
        up.portal_receiver,
        up.preferred,
        up.in_space AS user_in_space,
        p.mxid AS room_id,
        p.name AS portal_name,
        p.avatar_mxc AS portal_avatar_mxc,
        p.room_type,
        p.other_user_id,
        contact.full_name AS contact_name,
        contact.business_name,
        contact.push_name,
        ghost.name AS ghost_name,
        ghost.avatar_mxc AS ghost_avatar_mxc,
        ghost.avatar_mxcs AS ghost_avatar_mxcs,
        lid_map.mapped_lid,
        lid_map.mapped_pn
      FROM user_login ul
      JOIN user_portal up
        ON up.user_mxid = ul.user_mxid
       AND up.login_id = ul.id
      JOIN portal p
        ON COALESCE(p.bridge_id, '') = COALESCE(up.bridge_id, '')
       AND p.id = up.portal_id
       AND p.receiver = up.portal_receiver
      LEFT JOIN LATERAL (
        SELECT c.full_name, c.business_name, c.push_name
        FROM whatsmeow_contacts c
        LEFT JOIN whatsmeow_lid_map lid_map
          ON (
            p.id LIKE '%@lid'
            AND lid_map.lid = split_part(p.id, '@', 1)
          ) OR (
            p.id LIKE '%@s.whatsapp.net'
            AND lid_map.pn = split_part(p.id, '@', 1)
          )
        WHERE c.our_jid LIKE regexp_replace(COALESCE(ul.remote_profile->>'phone', ''), '[^0-9]', '', 'g') || ':%'
          AND c.their_jid IN (
            p.id,
            p.other_user_id,
            CASE WHEN lid_map.lid IS NULL THEN '' ELSE lid_map.lid || '@lid' END,
            CASE WHEN lid_map.pn IS NULL THEN '' ELSE lid_map.pn || '@s.whatsapp.net' END
          )
        ORDER BY
          (NULLIF(c.full_name, '') IS NOT NULL) DESC,
          (NULLIF(c.business_name, '') IS NOT NULL) DESC,
          (NULLIF(c.push_name, '') IS NOT NULL) DESC
        LIMIT 1
      ) contact ON true
      LEFT JOIN LATERAL (
        SELECT
          (array_agg(g.name ORDER BY (NULLIF(g.name, '') IS NOT NULL) DESC))[1] AS name,
          (array_agg(g.avatar_mxc ORDER BY (NULLIF(g.avatar_mxc, '') IS NOT NULL) DESC))[1] AS avatar_mxc,
          array_remove(array_agg(DISTINCT NULLIF(g.avatar_mxc, '')), NULL) AS avatar_mxcs
        FROM ghost g
        LEFT JOIN whatsmeow_lid_map lid_map
          ON (
            p.id LIKE '%@lid'
            AND lid_map.lid = split_part(p.id, '@', 1)
          ) OR (
            p.id LIKE '%@s.whatsapp.net'
            AND lid_map.pn = split_part(p.id, '@', 1)
          )
        WHERE g.id IN (
          p.id,
          p.other_user_id,
          CASE WHEN lid_map.lid IS NULL THEN '' ELSE lid_map.lid || '@lid' END,
          CASE WHEN lid_map.pn IS NULL THEN '' ELSE lid_map.pn || '@s.whatsapp.net' END
        )
      ) ghost ON true
      LEFT JOIN LATERAL (
        SELECT lm.lid AS mapped_lid, lm.pn AS mapped_pn
        FROM whatsmeow_lid_map lm
        WHERE (
          p.id LIKE '%@lid'
          AND lm.lid = split_part(p.id, '@', 1)
        ) OR (
          p.id LIKE '%@s.whatsapp.net'
          AND lm.pn = split_part(p.id, '@', 1)
        )
        LIMIT 1
      ) lid_map ON true
      WHERE ul.user_mxid = $1
      ORDER BY COALESCE(up.preferred, false) DESC, COALESCE(p.name, ''), p.id
    `,
    [matrixUserId]
  );
  const historyResult = await pool.query(
    `
      WITH current_login AS (
        SELECT bridge_id, id, user_mxid,
          COALESCE(NULLIF(metadata->>'logged_in_at', '')::bigint, 0) AS logged_in_at
        FROM user_login
        WHERE user_mxid = $1
      ), history_conversations AS (
        SELECT DISTINCT
          COALESCE(lm.pn || '@s.whatsapp.net', h.chat_jid) AS canonical_id,
          h.synced_login_ts,
          cl.logged_in_at
        FROM whatsapp_history_sync_conversation h
        JOIN current_login cl
          ON cl.bridge_id = h.bridge_id
         AND cl.id = h.user_login_id
        LEFT JOIN whatsmeow_lid_map lm
          ON h.chat_jid LIKE '%@lid'
         AND lm.lid = split_part(h.chat_jid, '@', 1)
        WHERE (
             h.chat_jid LIKE '%@s.whatsapp.net'
          OR h.chat_jid LIKE '%@lid'
          OR h.chat_jid LIKE '%@g.us'
        )
          AND h.chat_jid NOT IN ('0@s.whatsapp.net', '0@lid')
      ), current_portals AS (
        SELECT
          COALESCE(lm.pn || '@s.whatsapp.net', p.id) AS canonical_id,
          MAX(NULLIF(p.mxid, '')) AS room_id
        FROM user_portal up
        JOIN current_login cl
          ON cl.bridge_id = up.bridge_id
         AND cl.id = up.login_id
         AND cl.user_mxid = up.user_mxid
        JOIN portal p
          ON p.bridge_id = up.bridge_id
         AND p.id = up.portal_id
         AND p.receiver = up.portal_receiver
        LEFT JOIN whatsmeow_lid_map lm
          ON p.id LIKE '%@lid'
         AND lm.lid = split_part(p.id, '@', 1)
        WHERE p.id LIKE '%@s.whatsapp.net'
           OR p.id LIKE '%@lid'
           OR p.id LIKE '%@g.us'
        GROUP BY COALESCE(lm.pn || '@s.whatsapp.net', p.id)
      ), remote_union AS (
        SELECT canonical_id FROM history_conversations
        UNION
        SELECT canonical_id FROM current_portals
      )
      SELECT
        (SELECT count(*) FROM history_conversations) AS history_conversation_count,
        (SELECT count(*) FROM history_conversations
          WHERE synced_login_ts IS NULL OR synced_login_ts < logged_in_at
        ) AS history_unprocessed_count,
        (SELECT count(*) FROM history_conversations h
          LEFT JOIN current_portals p USING (canonical_id)
          WHERE p.room_id IS NULL
        ) AS history_pending_portal_count,
        (SELECT count(*) FROM remote_union) AS remote_eligible_conversation_count
    `,
    [matrixUserId]
  );
  const historyRow = historyResult.rows[0] || {};
  return {
    provider: MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
    portals: markDuplicateAliases(
      rows.map((row) =>
        normalizePortal(MATRIX_MESSAGING_PROVIDERS.WHATSAPP, row)
      )
    ),
    history: {
      conversationCount: Number(historyRow.history_conversation_count || 0),
      unprocessedCount: Number(historyRow.history_unprocessed_count || 0),
      pendingPortalCount: Number(historyRow.history_pending_portal_count || 0),
      remoteEligibleConversationCount: Number(
        historyRow.remote_eligible_conversation_count || 0
      ),
    },
  };
}

async function readSignalPortalEvidence(connection = {}) {
  const pool = getPool(MATRIX_MESSAGING_PROVIDERS.SIGNAL);
  const matrixUserId = normalizeString(connection.matrixUserId);
  if (!pool || !matrixUserId) return { provider: "signal", portals: [] };
  const { rows } = await pool.query(
    `
      SELECT
        ul.user_mxid,
        ul.id AS login_id,
        ul.remote_name,
        ul.remote_profile,
        ul.metadata,
        portal.mxid AS room_id,
        portal.id AS portal_id,
        portal.receiver AS portal_receiver,
        portal.other_user_id,
        portal.name AS portal_name,
        portal.avatar_mxc AS portal_avatar_mxc,
        portal.room_type,
        recipients.contact_name,
        recipients.profile_name,
        recipients.e164_number,
        ghost.name AS ghost_name,
        ghost.avatar_mxc AS ghost_avatar_mxc
      FROM user_login ul
      JOIN user_portal
        ON user_portal.user_mxid = ul.user_mxid
       AND user_portal.login_id = ul.id
      JOIN portal
        ON portal.bridge_id = user_portal.bridge_id
       AND portal.id = user_portal.portal_id
       AND portal.receiver = user_portal.portal_receiver
      LEFT JOIN signalmeow_recipients AS recipients
        ON recipients.account_id = user_portal.login_id
       AND (
            recipients.aci_uuid = portal.other_user_id
         OR recipients.aci_uuid = portal.id
         OR recipients.pni_uuid = replace(portal.id, 'PNI:', '')
         OR recipients.pni_uuid = replace(portal.other_user_id, 'PNI:', '')
         OR recipients.e164_number = portal.name
       )
      LEFT JOIN ghost
        ON ghost.id = portal.other_user_id
        OR ghost.id = portal.id
        OR ghost.id = replace(portal.id, 'PNI:', '')
      WHERE user_portal.user_mxid = $1
      ORDER BY lower(COALESCE(NULLIF(recipients.contact_name, ''), NULLIF(recipients.profile_name, ''), NULLIF(ghost.name, ''), NULLIF(portal.name, ''), portal.mxid))
    `,
    [matrixUserId]
  );
  return {
    provider: MATRIX_MESSAGING_PROVIDERS.SIGNAL,
    portals: rows.map((row) =>
      normalizePortal(MATRIX_MESSAGING_PROVIDERS.SIGNAL, {
        ...row,
        avatar_mxc: row.portal_avatar_mxc || row.ghost_avatar_mxc,
      })
    ),
  };
}

function indexPortalEvidence(provider = "", portals = []) {
  const byRoomId = new Map();
  for (const portal of portals || []) {
    const roomId = normalizeString(portal.roomId);
    const remoteChatType = provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP
      ? normalizeString(portal.remoteChatType) ||
        classifyWhatsAppPortalType(portal.portalId, portal.roomType || portal.type)
      : "";
    const whatsappEligible =
      provider !== MATRIX_MESSAGING_PROVIDERS.WHATSAPP ||
      (["dm", "group"].includes(remoteChatType) &&
        !portal.duplicateAlias &&
        !portal.identityAmbiguous);
    if (roomId && whatsappEligible) byRoomId.set(roomId, portal);
  }
  return { provider, portals, byRoomId };
}

async function collectBridgePortalEvidence(connections = []) {
  const portalBuckets = {
    [MATRIX_MESSAGING_PROVIDERS.WHATSAPP]: [],
    [MATRIX_MESSAGING_PROVIDERS.SIGNAL]: [],
  };
  const result = {
    [MATRIX_MESSAGING_PROVIDERS.WHATSAPP]: indexPortalEvidence(
      MATRIX_MESSAGING_PROVIDERS.WHATSAPP,
      []
    ),
    [MATRIX_MESSAGING_PROVIDERS.SIGNAL]: indexPortalEvidence(
      MATRIX_MESSAGING_PROVIDERS.SIGNAL,
      []
    ),
    errors: [],
  };

  for (const connection of connections || []) {
    const provider = normalizeString(connection.provider);
    try {
      const evidence =
        provider === MATRIX_MESSAGING_PROVIDERS.WHATSAPP
          ? await readWhatsAppPortalEvidence(connection)
          : provider === MATRIX_MESSAGING_PROVIDERS.SIGNAL
            ? await readSignalPortalEvidence(connection)
            : { provider, portals: [] };
      if (portalBuckets[provider]) {
        portalBuckets[provider].push(...(evidence.portals || []));
      }
    } catch (err) {
      result.errors.push({
        provider,
        code: "BRIDGE_PORTAL_READ_FAILED",
        message: err.message,
      });
    }
  }

  for (const provider of Object.keys(portalBuckets)) {
    result[provider] = indexPortalEvidence(provider, portalBuckets[provider]);
  }

  return result;
}

async function closeBridgeEvidencePools() {
  const pending = [...pools.values()].map((pool) => pool.end().catch(() => {}));
  pools.clear();
  await Promise.all(pending);
}

module.exports = {
  collectBridgePortalEvidence,
  readWhatsAppPortalEvidence,
  readSignalPortalEvidence,
  closeBridgeEvidencePools,
  normalizePortal,
  normalizeRoomType,
  __test: {
    postgresUriForProvider,
    readPostgresUriFromConfig,
    indexPortalEvidence,
  },
};
