"use strict";

const TEMPORAL_NAME_RE = /(date|time|timestamp|datetime|_at|_on|_ts|_dt)$/i;
const CREATED_RE =
  /^(created|inserted|added|generated|logged)([_\s-]?(at|on|date|time|ts|timestamp))?$/i;
const UPDATED_RE =
  /^(updated|modified|changed|edited|synced|refreshed)([_\s-]?(at|on|date|time|ts|timestamp))?$/i;
const DUE_RE =
  /^(due|deadline|expiry|expires|expired)([_\s-]?(at|on|date|time))?$/i;

const REFERENCE_NAME_RE = /(^|[_\s-])(id|ref|parent)([_\s-]|$)/i;

const DISPLAY_NAME_RE =
  /(^|[_\s-])(name|title|label|display|summary|description|desc|remark|note)([_\s-]|$)/i;

const IDENTIFIER_NAME_RE =
  /(^|[_\s-])(number|no|code|key|token|identifier|reference|ref)([_\s-]|$)/i;

function detectFieldSemantics(field) {
  const name = String(field.name || "").trim();
  const lowerName = name.toLowerCase();
  const type = String(field.type || "").toLowerCase();
  const samples = Array.isArray(field.sampleValues) ? field.sampleValues : [];

  const isPrimaryKey = Boolean(field.is_primary_key || field.primaryKey);
  const isForeignKey = Boolean(
    field.is_foreign_key || field.foreignKey || field.references
  );
  const isObjectIdPk =
    isPrimaryKey && (type === "objectid" || lowerName === "_id");

  const isReferenceField =
    !isPrimaryKey &&
    (isForeignKey ||
      Boolean(field.references) ||
      REFERENCE_NAME_RE.test(name) ||
      /(^|_).+_id$/i.test(name));

  const hasTemporalType = /(date|time|timestamp|datetime)/i.test(type);
  const hasTemporalName = TEMPORAL_NAME_RE.test(name);
  const hasTemporalSamples = samples.some(_looksLikeDate);

  let temporalRole = null;
  if (CREATED_RE.test(name)) temporalRole = "created";
  else if (UPDATED_RE.test(name)) temporalRole = "updated";
  else if (DUE_RE.test(name)) temporalRole = "due";

  const isTemporalCandidate =
    !isReferenceField &&
    !isObjectIdPk &&
    (hasTemporalType || hasTemporalName || hasTemporalSamples);

  const isRecencyCandidate =
    isObjectIdPk || temporalRole === "created" || temporalRole === "updated";

  const isNumeric =
    /(int|float|double|decimal|numeric|number|bigint|real|long|short)/i.test(
      type
    ) || samples.some((v) => typeof v === "number");

  const isBoolean =
    /bool/i.test(type) || samples.every((v) => typeof v === "boolean");

  const isText =
    /(string|text|varchar|char|keyword)/i.test(type) ||
    samples.some((v) => typeof v === "string");

  const isDisplayCandidate =
    isText && (DISPLAY_NAME_RE.test(name) || _looksHumanReadable(samples));

  const looksCategorical =
    isText &&
    !isDisplayCandidate &&
    samples.length > 0 &&
    _looksLowCardinalityCategory(samples);

  let isExactIdentifierCandidate =
    (isPrimaryKey && !isObjectIdPk) ||
    IDENTIFIER_NAME_RE.test(name) ||
    _looksLikeStructuredIdentifierSamples(samples);
  if (isReferenceField) {
    // reference fields are not human-search text
    // and not exact business identifiers
    isExactIdentifierCandidate = false;
  }
  return {
    roles: [],
    isPrimaryKey,
    isForeignKey,
    isReferenceField,
    isTemporalCandidate,
    isRecencyCandidate,
    isNumeric,
    isBoolean,
    isText,
    isCategorical: looksCategorical,
    isDisplayCandidate,
    isExactIdentifierCandidate,
    temporalRole,
  };
}

function scoreTemporalField(fieldProfile) {
  if (fieldProfile.isReferenceField) return -Infinity;
  if (!fieldProfile.isTemporalCandidate) return 0;

  let score = 0;
  if (fieldProfile.temporalRole === "created") score += 35;
  if (fieldProfile.temporalRole === "updated") score += 25;
  if (fieldProfile.temporalRole === "due") score += 15;
  if (fieldProfile.isRecencyCandidate) score += 20;
  return score;
}

function scoreRecencyField(fieldProfile) {
  const isObjectIdPk =
    fieldProfile.isPrimaryKey &&
    (String(fieldProfile.type || "").toLowerCase() === "objectid" ||
      String(fieldProfile.name || "") === "_id");

  if (fieldProfile.isReferenceField && !isObjectIdPk) return -Infinity;

  let score = 0;
  if (isObjectIdPk) score += 70;
  if (fieldProfile.temporalRole === "created") score += 35;
  if (fieldProfile.temporalRole === "updated") score += 25;
  if (fieldProfile.isRecencyCandidate) score += 15;
  return score;
}

function _looksLikeDate(value) {
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value === "string") {
    return (
      /^\d{4}-\d{2}-\d{2}/.test(value.trim()) || /T\d{2}:\d{2}/.test(value)
    );
  }
  if (typeof value === "number") {
    const abs = Math.abs(value);
    return (abs >= 1e12 && abs <= 4e12) || (abs >= 1e9 && abs <= 4e10);
  }
  return false;
}

function _looksHumanReadable(samples) {
  const strings = samples.filter((v) => typeof v === "string");
  return strings.some((s) => /[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(String(s)));
}

function _looksLikeStructuredIdentifierSamples(samples) {
  const strings = samples.filter((v) => typeof v === "string");
  if (!strings.length) return false;
  const hits = strings.filter((s) => _looksLikeStructuredIdentifierText(s));
  return hits.length >= Math.max(1, Math.floor(strings.length / 2));
}

function _looksLikeStructuredIdentifierText(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9/_:-]{3,}$/.test(text)) return false;
  return /[\d/_:-]/.test(text);
}

function _looksLowCardinalityCategory(samples) {
  const strings = samples
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!strings.length) return false;

  const uniqueCount = new Set(strings).size;
  if (uniqueCount > Math.max(3, Math.floor(strings.length * 0.7))) {
    return false;
  }

  return strings.every(
    (value) =>
      value.length <= 32 &&
      !/\s{2,}/.test(value) &&
      !/[0-9@]/.test(value) &&
      !/[\/:_-]/.test(value)
  );
}

module.exports = {
  detectFieldSemantics,
  scoreTemporalField,
  scoreRecencyField,
};
