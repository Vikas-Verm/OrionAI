"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findBestCommunicationMatch,
} = require("../services/communicationContactMatcher");

test("communication matcher handles fuzzy person-name differences and emoji noise", () => {
  const match = findBestCommunicationMatch("Aradhangini", [
    {
      record: { id: "tg-1", name: "Ardhangini ❤️❤️" },
      fields: ["Ardhangini ❤️❤️"],
    },
    {
      record: { id: "tg-2", name: "Hari" },
      fields: ["Hari"],
    },
  ]);

  assert.ok(match);
  assert.equal(match.item.record.id, "tg-1");
});

test("communication matcher resolves phone-number lookups against chat ids", () => {
  const match = findBestCommunicationMatch("+91 98765 43210", [
    {
      record: { id: "wa-1", name: "Rahul" },
      fields: ["Rahul", "919876543210", "919876543210@c.us"],
    },
  ]);

  assert.ok(match);
  assert.equal(match.item.record.id, "wa-1");
});
