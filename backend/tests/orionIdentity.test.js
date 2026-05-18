"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOrionIdentitySystemPrompt,
} = require("../config/orionIdentity");
const {
  detectIntroMetaIntent,
  buildIntroMetaResponse,
} = require("../services/orionIntroService");

const BANNED_GENERIC_CLAIMS = [
  /GPT-4 architecture/i,
  /FastAPI/i,
  /Flask/i,
  /PostgreSQL/i,
  /MongoDB/i,
  /training data up to/i,
];

function assertProductSafe(response) {
  assert.match(response, /OrionAI/);
  for (const pattern of BANNED_GENERIC_CLAIMS) {
    assert.doesNotMatch(response, pattern);
  }
}

test("intro/meta detector recognizes product identity questions", () => {
  const cases = [
    ["hi", "greeting"],
    ["hii", "greeting"],
    ["what is your name?", "identity"],
    ["who are you?", "identity"],
    ["what can you do?", "capabilities"],
    ["which stack are you built on?", "stack"],
    ["what is your configuration?", "configuration"],
    ["are you ChatGPT?", "chatgpt"],
    ["I am asking to your configuration OrionAI not chatgpt", "configuration"],
  ];

  for (const [message, expected] of cases) {
    assert.equal(detectIntroMetaIntent(message), expected, message);
  }
});

test("controlled intro responses identify as OrionAI without invented stack", () => {
  const messages = [
    "hi",
    "what is your name?",
    "who are you?",
    "what can you do?",
    "which stack are you built on?",
    "what is your configuration?",
    "are you ChatGPT?",
  ];

  for (const message of messages) {
    const intent = detectIntroMetaIntent(message);
    const response = buildIntroMetaResponse(intent, {
      user: {
        onboarding: {
          focusAreas: ["My Day", "Messages", "Study & Learning"],
        },
      },
      integrations: [],
      deploymentConfig: {},
    });

    assertProductSafe(response);
  }
});

test("identity response mentions product modules and personalization inputs", () => {
  const response = buildIntroMetaResponse("identity", {
    user: {
      onboarding: {
        focusAreas: ["My Day", "Messages", "Study & Learning"],
      },
    },
    integrations: [],
    deploymentConfig: {},
  });

  assert.match(response, /My Day/);
  assert.match(response, /Messages/);
  assert.match(response, /Study & Learning/);
  assert.match(response, /modules you enable/);
  assert.match(response, /apps or files you connect/);
});

test("configuration response uses enabled modules and connected apps without role assumptions", () => {
  const response = buildIntroMetaResponse("configuration", {
    user: {
      role: "Founder",
      onboarding: {
        focusAreas: ["Team & Work", "Engineering & Releases"],
      },
    },
    integrations: [
      {
        type: "slack",
        enabled: true,
        slack: { userToken: "xoxp-test" },
      },
    ],
    sessionFiles: [{ filename: "roadmap.pdf" }],
    deploymentConfig: {},
  });

  assertProductSafe(response);
  assert.match(response, /Team & Work/);
  assert.match(response, /Engineering & Releases/);
  assert.match(response, /Slack/);
  assert.match(response, /Uploaded files in this session: 1/);
  assert.doesNotMatch(response, /vendors/i);
  assert.doesNotMatch(response, /invoices/i);
  assert.doesNotMatch(response, /Gmail/);
});

test("stack response refuses to guess when public deployment config is unavailable", () => {
  const response = buildIntroMetaResponse("stack", {
    deploymentConfig: {},
  });

  assertProductSafe(response);
  assert.match(response, /should not guess my technical stack/i);
  assert.match(response, /deployment configuration from this chat/i);
});

test("stack response uses only explicit public deployment config values", () => {
  const response = buildIntroMetaResponse("stack", {
    deploymentConfig: {
      frontend: "Vue3.js",
      backend: "Node.js, Express REST API",
      database: "MongoDB",
      aiProvider: "Azure OpenAI",
      aiModel: "gpt-4o",
      integrations: ["Gmail", "Slack", "Google Calendar"],
    },
  });

  assert.match(response, /OrionAI is currently configured with/);
  assert.match(response, /Frontend: Vue3\.js/);
  assert.match(response, /Backend: Node\.js, Express REST API/);
  assert.match(response, /Database: MongoDB/);
  assert.match(response, /AI provider: Azure OpenAI/);
  assert.match(response, /AI model: gpt-4o/);
  assert.match(response, /Integrations: Gmail, Slack, Google Calendar/);
});

test("system prompt puts OrionAI identity and anti-hallucination rules first", () => {
  const prompt = buildOrionIdentitySystemPrompt({ deploymentConfig: {} });

  assert.match(prompt.split("\n")[0], /You are OrionAI/);
  assert.match(prompt, /Always identify as OrionAI/);
  assert.match(prompt, /Never say "I am ChatGPT"/);
  assert.match(prompt, /Never invent tech stack/);
  assert.match(prompt, /No shareable deployment stack\/model\/provider configuration/);
});
