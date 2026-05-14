"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const AUTH_SECRET = "test-auth-secret";
const DEFAULT_ONBOARDING = Object.freeze({
  hasCompletedAppConnection: false,
  hasCompletedFirstSync: false,
  hasSeenFirstBriefing: false,
  hasSelectedFocusAreas: false,
  focusAreas: [],
  skippedFocusAreas: false,
});

function makeFakeUserModel(seedUsers = []) {
  const state = seedUsers.map((user, index) => ({
    _id: user._id || `user-${index + 1}`,
    username: user.username || "",
    email: user.email || "",
    fullName: user.fullName || "",
    displayName: user.displayName || user.fullName || "",
    workspaceName: user.workspaceName || "",
    passwordHash: user.passwordHash || "",
    picture: user.picture || "",
    googleId: user.googleId || "",
    onboarding: {
      ...DEFAULT_ONBOARDING,
      ...(user.onboarding || {}),
      focusAreas: Array.isArray(user.onboarding?.focusAreas)
        ? [...user.onboarding.focusAreas]
        : [],
    },
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt || new Date(),
  }));

  let nextId = state.length + 1;

  function cloneUser(user) {
    if (!user) return null;
    return {
      ...user,
      onboarding: {
        ...DEFAULT_ONBOARDING,
        ...(user.onboarding || {}),
        focusAreas: Array.isArray(user.onboarding?.focusAreas)
          ? [...user.onboarding.focusAreas]
          : [],
      },
      createdAt: user.createdAt ? new Date(user.createdAt) : null,
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
    };
  }

  function matches(user, query = {}) {
    if (query.$or) return query.$or.some((part) => matches(user, part));
    return Object.entries(query).every(([key, value]) => user[key] === value);
  }

  class FakeUser {
    constructor(doc = {}) {
      Object.assign(this, cloneUser(doc) || {});
      if (!this._id) this._id = `user-${nextId++}`;
    }

    async save() {
      const stored = cloneUser({
        _id: this._id,
        username: this.username || "",
        email: this.email || "",
        fullName: this.fullName || "",
        displayName: this.displayName || "",
        workspaceName: this.workspaceName || "",
        passwordHash: this.passwordHash || "",
        picture: this.picture || "",
        googleId: this.googleId || "",
        onboarding: {
          ...DEFAULT_ONBOARDING,
          ...(this.onboarding || {}),
          focusAreas: Array.isArray(this.onboarding?.focusAreas)
            ? [...this.onboarding.focusAreas]
            : [],
        },
        lastLoginAt: this.lastLoginAt || null,
        createdAt: this.createdAt || new Date(),
      });

      const index = state.findIndex((user) => user._id === stored._id);
      if (index === -1) state.push(stored);
      else state[index] = stored;

      Object.assign(this, cloneUser(stored));
      return this;
    }

    static async create(doc) {
      const user = new FakeUser(doc);
      await user.save();
      return user;
    }

    static async findOne(query) {
      const found = state.find((user) => matches(user, query));
      return found ? new FakeUser(found) : null;
    }

    static async findById(id) {
      const found = state.find((user) => String(user._id) === String(id));
      return found ? new FakeUser(found) : null;
    }
  }

  return { FakeUser, state };
}

function loadAuthModules(seedUsers = []) {
  process.env.JWT_SECRET = AUTH_SECRET;

  const { FakeUser, state } = makeFakeUserModel(seedUsers);
  const modelPath = path.resolve(__dirname, "../models/user.js");

  delete require.cache[modelPath];
  delete require.cache[require.resolve("../utils/auth.js")];
  delete require.cache[require.resolve("../middleware/auth.js")];
  delete require.cache[require.resolve("../controllers/authController.js")];

  require.cache[modelPath] = {
    id: modelPath,
    filename: modelPath,
    loaded: true,
    exports: FakeUser,
  };

  const controller = require("../controllers/authController.js");
  const { authenticate } = require("../middleware/auth.js");

  return { controller, authenticate, state };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("register creates a normalized user, hashes the password, and returns sanitized auth data", async () => {
  const { controller, state } = loadAuthModules();
  const req = {
    body: {
      fullName: "  Orion Founder  ",
      email: "Founder@Example.COM ",
      username: " FoundingUser ",
      password: "supersecure",
      workspaceName: "  Private Beta  ",
    },
  };
  const res = makeRes();

  await controller.register(req, res);

  assert.equal(res.statusCode, 201);
  assert.ok(res.body.token);
  assert.deepEqual(res.body.user, {
    id: "user-1",
    username: "foundinguser",
    email: "founder@example.com",
    fullName: "Orion Founder",
    displayName: "Orion Founder",
    workspaceName: "Private Beta",
    picture: "",
    onboarding: { ...DEFAULT_ONBOARDING },
  });
  assert.equal(state.length, 1);
  assert.equal(state[0].username, "foundinguser");
  assert.equal(state[0].email, "founder@example.com");
  assert.equal(state[0].workspaceName, "Private Beta");
  assert.notEqual(state[0].passwordHash, "supersecure");
  assert.equal(await bcrypt.compare("supersecure", state[0].passwordHash), true);
  assert.equal(Object.prototype.hasOwnProperty.call(res.body.user, "passwordHash"), false);
});

test("register returns friendly duplicate email and username errors", async () => {
  const passwordHash = await bcrypt.hash("existingpass", 4);
  const { controller } = loadAuthModules([
    {
      _id: "user-1",
      username: "existinguser",
      email: "existing@example.com",
      fullName: "Existing User",
      displayName: "Existing User",
      passwordHash,
    },
  ]);

  const duplicateEmailRes = makeRes();
  await controller.register(
    {
      body: {
        fullName: "Another User",
        email: "existing@example.com",
        username: "anotheruser",
        password: "anotherpass",
      },
    },
    duplicateEmailRes
  );

  assert.equal(duplicateEmailRes.statusCode, 409);
  assert.equal(
    duplicateEmailRes.body.error,
    "An account with that email already exists."
  );
  assert.equal(
    duplicateEmailRes.body.fieldErrors.email,
    "That email is already in use."
  );

  const duplicateUsernameRes = makeRes();
  await controller.register(
    {
      body: {
        fullName: "Another User",
        email: "another@example.com",
        username: "ExistingUser",
        password: "anotherpass",
      },
    },
    duplicateUsernameRes
  );

  assert.equal(duplicateUsernameRes.statusCode, 409);
  assert.equal(duplicateUsernameRes.body.error, "That username is already taken.");
  assert.equal(
    duplicateUsernameRes.body.fieldErrors.username,
    "That username is already taken."
  );
});

test("login supports username, email, and the legacy username field", async () => {
  const passwordHash = await bcrypt.hash("welcome123", 4);
  const { controller } = loadAuthModules([
    {
      _id: "user-1",
      username: "existinguser",
      email: "existing@example.com",
      fullName: "Existing User",
      displayName: "Existing User",
      workspaceName: "Workspace",
      passwordHash,
    },
  ]);

  const byUsernameRes = makeRes();
  await controller.login(
    {
      body: {
        identifier: "ExistingUser",
        password: "welcome123",
      },
    },
    byUsernameRes
  );

  assert.equal(byUsernameRes.statusCode, 200);
  assert.equal(byUsernameRes.body.user.username, "existinguser");

  const byEmailRes = makeRes();
  await controller.login(
    {
      body: {
        identifier: "Existing@Example.com",
        password: "welcome123",
      },
    },
    byEmailRes
  );

  assert.equal(byEmailRes.statusCode, 200);
  assert.equal(byEmailRes.body.user.email, "existing@example.com");

  const legacyPayloadRes = makeRes();
  await controller.login(
    {
      body: {
        username: "existinguser",
        password: "welcome123",
      },
    },
    legacyPayloadRes
  );

  assert.equal(legacyPayloadRes.statusCode, 200);
  assert.equal(legacyPayloadRes.body.user.fullName, "Existing User");
});

test("authenticate + getMe return the sanitized current user", async () => {
  const passwordHash = await bcrypt.hash("welcome123", 4);
  const { controller, authenticate } = loadAuthModules([
    {
      _id: "user-7",
      username: "meuser",
      email: "me@example.com",
      fullName: "Me User",
      displayName: "Me User",
      workspaceName: "My Workspace",
      passwordHash,
    },
  ]);

  const req = {
    headers: {
      authorization: `Bearer ${jwt.sign(
        { userId: "user-7", username: "meuser" },
        AUTH_SECRET,
        { expiresIn: "30d" }
      )}`,
    },
  };
  const authRes = makeRes();
  let nextCalled = false;

  authenticate(req, authRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);

  const res = makeRes();
  await controller.getMe(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.user, {
    id: "user-7",
    username: "meuser",
    email: "me@example.com",
    fullName: "Me User",
    displayName: "Me User",
    workspaceName: "My Workspace",
    picture: "",
    onboarding: { ...DEFAULT_ONBOARDING },
  });
});
