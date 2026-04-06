"use strict";

const mongoose = require("mongoose");
const { enrichReferences } = require("../schema/referenceInference");

const MAX_RESULT_ROWS = 200;
const SCHEMA_SAMPLE_N = 20; // docs to sample per collection
const PROFILE_SAMPLE_N = 12; // docs for field profiling

/**
 * MongoAdapter
 *
 * Implements the adapter interface for MongoDB.
 * Every public method opens and closes its own connection (stateless).
 *
 * Interface:
 *   introspectSchema()
 *   profileObjects(objects, options)
 *   executePlan(plan)
 *   detectCapabilities()
 */
class MongoAdapter {
  constructor(config) {
    this._config = config;
  }

  // ─── Interface ─────────────────────────────────────────────────────────────

  detectCapabilities() {
    return {
      supportsJoins: false,
      supportsLookupJoin: true,
      supportsAggregation: true,
      supportsNestedPaths: true,
      supportsWindowFunctions: false,
      supportsILIKE: false,
      supportsCaseInsensitiveLike: true,
      supportsExplain: true,
      supportsGroupBy: true,
      supportsCTE: false,
      supportsFullTextSearch: true,
    };
  }

  async introspectSchema() {
    return this._withConnection(async (conn) => {
      const db = conn.db;
      const dbName =
        db.databaseName ||
        this._config.connectionString.split("/").pop()?.split("?")[0] ||
        "unknown";

      let collections = [];
      try {
        collections = await db.listCollections().toArray();
      } catch {}

      // If no collections in primary DB, try all accessible DBs
      if (!collections.length) {
        const admin = conn.client.db("admin");
        let dbs = [];
        try {
          dbs = (await admin.admin().listDatabases()).databases || [];
        } catch {}
        for (const d of dbs) {
          if (["admin", "config", "local"].includes(d.name)) continue;
          const otherDb = conn.client.db(d.name);
          const cols = await otherDb
            .listCollections()
            .toArray()
            .catch(() => []);
          for (const c of cols) {
            collections.push({ name: `${d.name}.${c.name}`, _db: otherDb });
          }
        }
      }

      const objects = [];
      for (const col of collections) {
        try {
          const collDb = col._db || db;
          const collName = col._db
            ? _extractCollectionNameFromQualifiedNamespace(col.name)
            : col.name;
          const coll = collDb.collection(collName);
          // Sample most recent docs for better field coverage
          const sample = await coll
            .find({}, { sort: { _id: -1 } })
            .limit(SCHEMA_SAMPLE_N)
            .toArray();
          const doc = sample[0] || {};

          let estimated = 0;
          try {
            estimated = await coll.estimatedDocumentCount();
          } catch {}

          objects.push({
            name: col._db ? `${col.name}` : col.name,
            type: "collection",
            fields: _extractMongoFields(doc, sample),
            primary_keys: ["_id"],
            estimated_rows: estimated,
          });
        } catch {}
      }

      return {
        vendor: "mongodb",
        objects: enrichReferences(objects),
      };
    });
  }

  async profileObjects(objects, options = {}) {
    return this._withConnection(async (conn) => {
      const db = conn.db;
      const result = {};

      for (const obj of objects) {
        try {
          const { collection: coll } = await _resolveCollectionHandle(
            conn,
            obj.name
          );
          const samples = await coll
            .find({}, { sort: { _id: -1 } })
            .limit(PROFILE_SAMPLE_N)
            .toArray();

          const fieldSamples = {};
          const topValues = {};
          for (const doc of samples) {
            for (const [k, v] of Object.entries(doc)) {
              if (!fieldSamples[k]) fieldSamples[k] = [];
              if (v !== null && v !== undefined && fieldSamples[k].length < 5) {
                fieldSamples[k].push(_safeValue(v));
              }
            }
          }

          result[obj.name] = {
            samples: fieldSamples,
            row_estimate: obj.estimated_rows,
            topValues,
          };
        } catch {
          result[obj.name] = { samples: {}, topValues: {} };
        }
      }
      return result;
    });
  }

  async executePlan(physicalPlan) {
    return this._withConnection(async (conn) => {
      const { collection: coll } = await _resolveCollectionHandle(
        conn,
        physicalPlan.collection
      );

      if (physicalPlan.operation === "aggregate") {
        const rows = await coll
          .aggregate(physicalPlan.pipeline || [], { allowDiskUse: true })
          .limit(MAX_RESULT_ROWS)
          .toArray();
        return { rows, rowCount: rows.length };
      }

      if (physicalPlan.operation === "count") {
        const count = await coll.countDocuments(physicalPlan.query || {});
        return { rows: [{ count }], rowCount: 1 };
      }

      // find
      const limit = Math.min(physicalPlan.limit || 20, MAX_RESULT_ROWS);
      const cursor = coll.find(physicalPlan.query || {}, {
        projection:
          physicalPlan.projection && Object.keys(physicalPlan.projection).length
            ? physicalPlan.projection
            : undefined,
        sort:
          physicalPlan.sort && Object.keys(physicalPlan.sort).length
            ? physicalPlan.sort
            : undefined,
        limit,
      });
      const rows = await cursor.toArray();
      return { rows, rowCount: rows.length };
    });
  }

  // ─── Connection management ─────────────────────────────────────────────────

  async _withConnection(fn) {
    const conn = await this._connect();
    try {
      return await fn(conn);
    } finally {
      await conn.connection.close().catch(() => {});
    }
  }

  async _connect() {
    const connection = mongoose.createConnection(
      this._config.connectionString,
      {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 2,
        autoIndex: false,
      }
    );
    await connection.asPromise();
    return { connection, db: connection.db, client: connection.getClient() };
  }
}

async function _resolveCollectionHandle(conn, namespace) {
  const fullName = String(namespace || "").trim();
  if (!fullName) {
    throw new Error("Mongo collection namespace is required.");
  }

  const currentDb = conn.db;
  if (await _collectionExists(currentDb, fullName)) {
    return {
      db: currentDb,
      collection: currentDb.collection(fullName),
      namespace: `${currentDb.databaseName}.${fullName}`,
    };
  }

  const qualified = _splitQualifiedNamespace(fullName);
  if (qualified) {
    const targetDb = conn.client.db(qualified.dbName);
    if (await _collectionExists(targetDb, qualified.collectionName)) {
      return {
        db: targetDb,
        collection: targetDb.collection(qualified.collectionName),
        namespace: `${qualified.dbName}.${qualified.collectionName}`,
      };
    }
  }

  return {
    db: currentDb,
    collection: currentDb.collection(fullName),
    namespace: `${currentDb.databaseName}.${fullName}`,
  };
}

async function _collectionExists(db, collectionName) {
  try {
    const matches = await db
      .listCollections({ name: collectionName }, { nameOnly: true })
      .toArray();
    return matches.some((entry) => entry?.name === collectionName);
  } catch {
    return false;
  }
}

function _splitQualifiedNamespace(namespace) {
  const fullName = String(namespace || "").trim();
  const dotIndex = fullName.indexOf(".");
  if (dotIndex <= 0 || dotIndex >= fullName.length - 1) {
    return null;
  }

  const dbName = fullName.slice(0, dotIndex);
  const collectionName = fullName.slice(dotIndex + 1);
  if (!_isValidMongoDatabaseName(dbName) || !collectionName) {
    return null;
  }

  return { dbName, collectionName };
}

function _extractCollectionNameFromQualifiedNamespace(namespace) {
  const qualified = _splitQualifiedNamespace(namespace);
  return qualified ? qualified.collectionName : String(namespace || "");
}

function _isValidMongoDatabaseName(name) {
  const value = String(name || "").trim();
  if (!value) return false;
  return !/[\/\\. "$*<>:|?\0]/.test(value);
}

// ─── Field extraction helpers ──────────────────────────────────────────────────

function _extractMongoFields(primaryDoc, allSamples) {
  const fieldMap = new Map();

  // Collect all keys across samples (not just first doc)
  for (const doc of allSamples) {
    for (const [key, val] of Object.entries(doc || {})) {
      if (!fieldMap.has(key)) {
        fieldMap.set(key, {
          name: key,
          type: key === "_id" ? "objectid" : _mongoType(val),
          is_primary_key: key === "_id",
          is_foreign_key: false,
          nested_paths: _collectNestedPaths(val, key, 0),
        });
      }
    }
  }

  return [...fieldMap.values()].slice(0, 60);
}

function _mongoType(value) {
  if (value === null || value === undefined) return "mixed";
  if (value instanceof Date) return "date";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") {
    const bt = value?._bsontype;
    if (bt === "ObjectID" || bt === "ObjectId") return "objectid";
    if (bt === "Decimal128") return "decimal";
    if (bt === "Long" || bt === "Int32") return "number";
    if (bt === "Timestamp") return "date";
    return "object";
  }
  return typeof value; // string | number | boolean
}

function _collectNestedPaths(value, prefix, depth) {
  if (depth >= 2 || !value || typeof value !== "object" || Array.isArray(value))
    return [];
  const paths = [];
  for (const [k, v] of Object.entries(value)) {
    paths.push(`${prefix}.${k}`);
    paths.push(..._collectNestedPaths(v, `${prefix}.${k}`, depth + 1));
  }
  return paths.slice(0, 10);
}

function _safeValue(v) {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null) {
    if (v._bsontype === "ObjectID" || v._bsontype === "ObjectId")
      return v.toString();
    return JSON.stringify(v).slice(0, 80);
  }
  return v;
}

module.exports = {
  MongoAdapter,
  __test: {
    _resolveCollectionHandle,
    _splitQualifiedNamespace,
    _extractCollectionNameFromQualifiedNamespace,
  },
};
