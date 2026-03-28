"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveCalendarAttendees,
} = require("../services/calendarAttendeeResolver");

test("resolveCalendarAttendees keeps direct emails and resolves Orion usernames", async () => {
  const result = await resolveCalendarAttendees(
    [
      "vikasverma",
      { email: "approver@example.com", name: "Approver" },
    ],
    {
      resolveIdentity: async (seed) => {
        if (seed.identities.includes("vikasverma")) {
          return {
            email: "vikas.verma@company.com",
            userId: "vikasverma",
            displayName: "Vikas Verma",
          };
        }
        return null;
      },
    }
  );

  assert.deepEqual(result.attendees, [
    { email: "vikas.verma@company.com", displayName: "Vikas Verma" },
    { email: "approver@example.com", displayName: "Approver" },
  ]);
  assert.deepEqual(result.resolvedUserIds, ["vikasverma"]);
  assert.deepEqual(result.unresolved, []);
});

test("resolveCalendarAttendees deduplicates resolved emails and reports unresolved names", async () => {
  const result = await resolveCalendarAttendees(
    ["vikasverma", { email: "vikasverma", name: "Vikas" }, "unknown user"],
    {
      resolveIdentity: async (seed) => {
        if (seed.identities.includes("vikasverma")) {
          return {
            email: "vikas.verma@company.com",
            userId: "vikasverma",
            displayName: "Vikas Verma",
          };
        }
        return null;
      },
    }
  );

  assert.deepEqual(result.attendees, [
    { email: "vikas.verma@company.com", displayName: "Vikas Verma" },
  ]);
  assert.deepEqual(result.resolvedUserIds, ["vikasverma"]);
  assert.deepEqual(result.unresolved, ["unknown user"]);
});
