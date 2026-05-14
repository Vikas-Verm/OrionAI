const bcrypt = require("bcryptjs");
const User = require("../models/user");
const {
  MIN_PASSWORD_LENGTH,
  cleanString,
  normalizeEmail,
  normalizeUsername,
  isValidEmail,
  sanitizeUser,
  createAuthToken,
} = require("../utils/auth");

function buildFieldErrorResponse(res, fieldErrors, status = 400, error) {
  return res.status(status).json({
    error: error || "Please correct the highlighted fields and try again.",
    fieldErrors,
  });
}

async function findUserByLoginIdentifier(identifier) {
  const rawValue = cleanString(identifier);
  if (!rawValue) return null;

  const username = normalizeUsername(rawValue);
  const email = normalizeEmail(rawValue);
  const queries = isValidEmail(rawValue)
    ? [{ email }, { username }]
    : [{ username }, { email }];

  for (const query of queries) {
    const user = await User.findOne(query);
    if (user) return user;
  }

  return null;
}

async function register(req, res) {
  const fullName = cleanString(req.body?.fullName);
  const email = normalizeEmail(req.body?.email);
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const workspaceName = cleanString(req.body?.workspaceName);

  const fieldErrors = {};

  if (!fullName) fieldErrors.fullName = "Full name is required.";
  if (!email) fieldErrors.email = "Email is required.";
  else if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (!username) fieldErrors.username = "Username is required.";
  if (!password) fieldErrors.password = "Password is required.";
  else if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return buildFieldErrorResponse(res, fieldErrors);
  }

  try {
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return buildFieldErrorResponse(
        res,
        { email: "That email is already in use." },
        409,
        "An account with that email already exists."
      );
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return buildFieldErrorResponse(
        res,
        { username: "That username is already taken." },
        409,
        "That username is already taken."
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      fullName,
      displayName: fullName,
      email,
      username,
      passwordHash,
      workspaceName,
      lastLoginAt: new Date(),
    });

    return res.status(201).json({
      token: createAuthToken(user),
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Register error:", error.message);
    return res.status(500).json({ error: "Registration failed." });
  }
}

async function login(req, res) {
  const identifier = cleanString(
    req.body?.identifier || req.body?.username || req.body?.email
  );
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const fieldErrors = {};
  if (!identifier) fieldErrors.identifier = "Email or username is required.";
  if (!password) fieldErrors.password = "Password is required.";

  if (Object.keys(fieldErrors).length > 0) {
    return buildFieldErrorResponse(
      res,
      fieldErrors,
      400,
      "Email or username and password are required."
    );
  }

  try {
    const user = await findUserByLoginIdentifier(identifier);

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email, username, or password." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email, username, or password." });
    }

    user.lastLoginAt = new Date();
    await user.save();

    return res.json({
      token: createAuthToken(user),
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ error: "Login failed." });
  }
}

async function getMe(req, res) {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error("Get me error:", error.message);
    return res.status(500).json({ error: "Unable to load account." });
  }
}

module.exports = { register, login, getMe };
