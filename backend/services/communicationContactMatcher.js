"use strict";

const Fuse = require("fuse.js");

function normalizeCommunicationText(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9@.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDigits(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function buildAliases(fields = []) {
  const aliases = new Set();

  for (const field of fields) {
    const normalized = normalizeCommunicationText(field);
    if (!normalized) continue;

    aliases.add(normalized);
    aliases.add(normalized.replace(/\s+/g, ""));

    const words = normalized.split(" ").filter(Boolean);
    if (words.length) {
      aliases.add(words[0]);
      if (words.length >= 2) aliases.add(words.slice(0, 2).join(" "));
    }

    if (normalized.includes("@")) {
      aliases.add(normalized.split("@")[0]);
    }
  }

  return [...aliases];
}

function buildPreparedCandidates(candidates = []) {
  return candidates
    .map((candidate, index) => {
      const fields = unique(candidate?.fields || []);
      const aliases = buildAliases(fields);
      const digits = unique(fields.map((field) => normalizeDigits(field)).filter((value) => value.length >= 6));

      return {
        ...candidate,
        __index: index,
        aliases,
        digits,
        searchText: aliases.join(" "),
        compactText: aliases.map((alias) => alias.replace(/\s+/g, "")).join(" "),
      };
    })
    .filter((candidate) => candidate.aliases.length || candidate.digits.length);
}

function findDirectMatch(preparedCandidates = [], query = "") {
  const normalizedQuery = normalizeCommunicationText(query);
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const queryDigits = normalizeDigits(query);

  if (queryDigits.length >= 6) {
    const digitMatch = preparedCandidates.find((candidate) =>
      candidate.digits.some(
        (digits) => digits === queryDigits || digits.endsWith(queryDigits)
      )
    );
    if (digitMatch) return { item: digitMatch, matchType: "digits", score: 0 };
  }

  if (!normalizedQuery) return null;

  const exactMatch = preparedCandidates.find((candidate) =>
    candidate.aliases.some(
      (alias) => alias === normalizedQuery || alias.replace(/\s+/g, "") === compactQuery
    )
  );
  if (exactMatch) return { item: exactMatch, matchType: "exact", score: 0 };

  const tokenMatch = preparedCandidates.find((candidate) =>
    candidate.aliases.some((alias) => {
      if (alias.startsWith(normalizedQuery)) return true;
      const words = alias.split(" ");
      return words.some((word) => word.startsWith(normalizedQuery));
    })
  );
  if (tokenMatch) return { item: tokenMatch, matchType: "prefix", score: 0.08 };

  return null;
}

function findBestCommunicationMatch(query, candidates = [], options = {}) {
  const preparedCandidates = buildPreparedCandidates(candidates);
  const directMatch = findDirectMatch(preparedCandidates, query);
  if (directMatch) return directMatch;

  const normalizedQuery = normalizeCommunicationText(query);
  if (!normalizedQuery) return null;

  const threshold =
    typeof options.threshold === "number" ? options.threshold : 0.34;
  const fuse = new Fuse(preparedCandidates, {
    includeScore: true,
    threshold,
    keys: [
      { name: "searchText", weight: 0.7 },
      { name: "compactText", weight: 0.3 },
    ],
  });

  const result = fuse.search(normalizedQuery)[0];
  if (!result || typeof result.score !== "number" || result.score > threshold) {
    return null;
  }

  return {
    item: result.item,
    matchType: "fuzzy",
    score: result.score,
  };
}

module.exports = {
  normalizeCommunicationText,
  normalizeDigits,
  findBestCommunicationMatch,
  __test: {
    buildAliases,
    buildPreparedCandidates,
    findDirectMatch,
  },
};
