"use strict";

function buildIntentPrompt(
  question,
  entityNames = [],
  timeRangeHint = null,
  hasCompareWindows = false
) {
  const entityList = entityNames.length
    ? `Known entities in this database: ${entityNames.slice(0, 50).join(", ")}`
    : "No schema context available.";

  const timeNote = timeRangeHint
    ? `Time range already parsed deterministically: ${timeRangeHint}. Do NOT invent dates.`
    : "No explicit time range detected. Set time_range to null unless the user clearly gives a real date or date range.";

  const compareNote = hasCompareWindows
    ? "This is a compare question. Set intent to 'compare'."
    : "";

  return `You are OrionAI's question parser.

Return ONLY valid JSON.
Do NOT generate SQL or MongoDB.
Do NOT guess actual field names from schema.
Do NOT use any fixed business vocabulary.

Extract:
- intent
- entity
- filters using the user's own words
- value type
- operator
- sort intent
- metric intent
- grouping intent

${entityList}
${timeNote}
${compareNote}

INTENTS:
- count
- latest
- list
- aggregate
- compare
- lookup
- trend
- grouped_metric
- distribution
- unknown

For filters:
- role: a short phrase from the user's wording
- value: the value
- operator: eq, contains_ci, starts_with, gt, gte, lt, lte, in, is_null, is_not_null
- value_kind: identifier, text, number, date, datetime, boolean, unknown

Use the user's own phrases as filter roles.
Do not translate them into a fixed ontology.
If the user says "by reviewer Neha" then role can be "reviewer".
If the user says "status active" then role can be "status".
If the user gives an exact identifier, keep that value exactly.
If the user gives a human name or general text without saying an exact identifier, prefer contains_ci over eq.

Question: "${question}"

Return JSON:
{
  "intent": "...",
  "entity": "...",
  "entity_hints": ["..."],
  "filters": [
    {
      "role": "...",
      "value": "...",
      "operator": "eq",
      "value_kind": "identifier",
      "confidence": 0.9
    }
  ],
  "time_range": null,
  "metrics": [{ "function": "count", "role": "..." }],
  "group_by": [{ "role": "..." }],
  "sort": [{ "role": "...", "direction": "desc" }],
  "limit": 20,
  "projection": "full_record",
  "compare_windows": [],
  "ambiguities": [],
  "confidence": 0.9,
  "parser_notes": "brief note"
}`;
}

module.exports = { buildIntentPrompt };
