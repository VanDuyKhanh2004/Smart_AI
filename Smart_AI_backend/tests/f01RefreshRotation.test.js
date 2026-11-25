"use strict";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = "test-f01-access-secret";
process.env.JWT_REFRESH_SECRET = "test-f01-refresh-secret";
process.env.JWT_REFRESH_EXPIRE = "7d";
process.env.CSRF_SECRET = "c".repeat(64);
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.LOG_LEVEL = "silent";

const express = require("express");
const request = require("supertest");

const mockVerifyIdToken = jest.fn();

jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

jest.mock("../services/emailQueueService", () => ({
  enqueueWelcomeEmail: jest.fn(),
  enqueueVerificationEmail: jest.fn(),
  enqueuePasswordResetEmail: jest.fn(),
  enqueueUnlockAccountEmail: jest.fn(),
}));

jest.mock("../services/verificationResendService", () => ({
  claimResendCooldown: jest.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 60 }),
  startResendCooldown: jest.fn(),
  releaseResendCooldown: jest.fn(),
  checkLongWindow: jest.fn().mockResolvedValue({ allowed: true }),
  incrementLongWindow: jest.fn(),
  getCooldownSeconds: jest.fn(() => 60),
}));

jest.mock("../models/User", () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  create: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  findByUnlockToken: jest.fn(),
}));

const User = require("../models/User");
const authRoutes = require("../routes/authRoutes");
const profileRoutes = require("../routes/profileRoutes");
const errorHandler = require("../middlewares/errorHandler");
const { resetRateLimiters } = require("../middlewares/rateLimiters");
const { parseCookies, noStoreAuthResponses } = require("../middlewares/cookieAuth");
const { csrfProtection } = require("../middlewares/csrfMiddleware");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");
const { hashToken } = require("../utils/tokenHash");
const { generateCsrfToken, verifyCsrfToken } = require("../utils/csrf");
const { CSRF_COOKIE_NAME } = require("../configs/authCookies");

const USER_ID = "507f191e810c19729de860ea";
const ORIGIN = "http://localhost:5173";

function chain(result) {
  return {
    select: jest.fn().mockResolvedValue(result),
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
}

function makeUser(overrides = {}) {
  const user = {
    _id: USER_ID,
    name: "Test User",
    email: "user@test.com",
    role: "user",
    password: "hashed-password",
    googleId: null,
    emailVerified: true,
    welcomeEmailSent: true,
    loginAttempts: 0,
    lockUntil: null,
    tokenVersion: 0,
    refreshTokenHash: null,
    refreshTokenPrevHash: null,
    refreshTokenSessionId: null,
    refreshTokenRotatedAt: null,
    comparePassword: jest.fn().mockResolvedValue(true),
    incrementLoginAttempts: jest.fn(),
    save: jest.fn(function save() {
      return Promise.resolve(this);
    }),
    toJSON: jest.fn(function toJSON() {
      return {
        id: this._id,
        email: this.email,
        role: this.role,
        name: this.name,
      };
    }),
    get isLocked() {
      return Boolean(this.lockUntil && this.lockUntil > Date.now());
    },
  };

  return Object.assign(user, overrides);
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(parseCookies);
  app.use(noStoreAuthResponses);
  app.use(csrfProtection());
  app.use("/api/auth", authRoutes);
  app.use("/api/profile", profileRoutes);
  app.get("/api/test/protected", (req, res) => res.json({ ok: true }));
  app.post("/api/test/protected", (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

function setCookieValue(res, name) {
  const cookies = res.headers["set-cookie"] || [];
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!match) return null;
  return match.slice(name.length + 1).split(";")[0];
}

function cookieHeader(name, value) {
  return `${name}=${value}`;
}

function csrfPair(token = generateCsrfToken()) {
  return { token, cookie: `${CSRF_COOKIE_NAME}=${token}` };
}

function mockLoginPersistence(user, { tokenVersion = 1 } = {}) {
  User.findOneAndUpdate.mockImplementation(async (filter, update) => {
    if (update && update.$inc && update.$inc.tokenVersion) {
      return chain({ ...user, tokenVersion });
    }

    if (
      update &&
      update.$set &&
      Object.prototype.hasOwnProperty.call(update.$set, "refreshTokenHash") &&
      !Object.prototype.hasOwnProperty.call(filter, "refreshTokenHash")
    ) {
      user.tokenVersion = filter.tokenVersion;
      if (filter.tokenVersion !== user.tokenVersion) return null;
      Object.assign(user, update.$set);
      return chain(user);
    }

    return null;
  });
}

function prepareSession(user, { tokenVersion = 2, sessionId = "session-1" } = {}) {
  user.tokenVersion = tokenVersion;
  const token = generateRefreshToken(user, { sessionId });
  user.refreshTokenHash = hashToken(token);
  user.refreshTokenPrevHash = null;
  user.refreshTokenSessionId = sessionId;
  user.refreshTokenRotatedAt = new Date();

  User.findById.mockImplementation(() => chain(user));
  User.findOneAndUpdate.mockImplementation(async (filter, update) => {
    if (filter._id !== user._id) return null;
    if (filter.tokenVersion !== user.tokenVersion) return null;
    if (filter.refreshTokenHash !== user.refreshTokenHash) return null;

    Object.assign(user, update.$set);
    return user;
  });

  return token;
}

describe("F-01 authentication cookies", () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    jest.clearAllMocks();
    app = buildApp();
    User.findByIdAndUpdate.mockResolvedValue({});
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });
    User.findOneAndUpdate.mockImplementation(async (filter, update) => {
      if (update && update.$inc && update.$inc.tokenVersion) {
        return chain({ _id: filter._id, tokenVersion: 1 });
      }
      if (
        update &&
        update.$set &&
        Object.prototype.hasOwnProperty.call(update.$set, "refreshTokenHash")
      ) {
        return chain({ _id: filter._id, tokenVersion: filter.tokenVersion });
      }
      return null;
    });
    User.create.mockResolvedValue(makeUser());
  });

  it("sets access/refresh/CSRF cookies on password login while keeping the JSON contract", async () => {
    const user = makeUser();
    User.findByEmailWithPassword.mockResolvedValue(user);
    mockLoginPersistence(user, { tokenVersion: 1 });

    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: "correct" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();

    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some((cookie) => cookie.startsWith("__sa_access="))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("__sa_refresh="))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("__sa_csrf="))).toBe(true);

    const accessCookie = cookies.find((cookie) => cookie.startsWith("__sa_access="));
    const refreshCookie = cookies.find((cookie) => cookie.startsWith("__sa_refresh="));
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("__sa_csrf="));

    expect(accessCookie).toMatch(/HttpOnly/i);
    expect(accessCookie).toMatch(/Path=\/api(;|$)/i);
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/Path=\/api\/auth(;|$)/i);
    expect(csrfCookie).not.toMatch(/HttpOnly/i);
    expect(csrfCookie).toMatch(/Path=\/(;|$)/i);

    const decoded = verifyRefreshToken(res.body.data.refreshToken);
    expect(decoded.type).toBe("refresh");
    expect(typeof decoded.jti).toBe("string");
    expect(decoded.sid).toBe(user.refreshTokenSessionId);

    expect(user.tokenVersion).toBe(1);
    expect(user.refreshTokenHash).toBe(hashToken(res.body.data.refreshToken));
    expect(user.refreshTokenHash).not.toBe(res.body.data.refreshToken);
    expect(user.refreshToken).toBeUndefined();
  });

  it("does not emit authentication cookies when session persistence fails", async () => {
    const user = makeUser();
    User.findByEmailWithPassword.mockResolvedValue(user);
    User.findOneAndUpdate
      .mockResolvedValueOnce(chain({ ...user, tokenVersion: 1 }))
      .mockRejectedValueOnce(new Error("db write failed"));

    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: "correct" });

    expect(res.status).toBe(500);
    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some((cookie) => cookie.startsWith("__sa_access="))).toBe(false);
    expect(cookies.some((cookie) => cookie.startsWith("__sa_refresh="))).toBe(false);
    expect(cookies.some((cookie) => cookie.startsWith("__sa_csrf="))).toBe(false);
  });

  it("returns a deterministic conflict without cookies when a concurrent login wins the session write", async () => {
    const user = makeUser();
    User.findByEmailWithPassword.mockResolvedValue(user);
    User.findOneAndUpdate
      .mockResolvedValueOnce(chain({ ...user, tokenVersion: 1 }))
      .mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: "correct" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LOGIN_SESSION_CONFLICT");
    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some((cookie) => cookie.startsWith("__sa_access="))).toBe(false);
    expect(cookies.some((cookie) => cookie.startsWith("__sa_refresh="))).toBe(false);
  });

  it("invalidates the earlier login access token when a later login wins", async () => {
    const user = makeUser();
    User.findByEmailWithPassword.mockResolvedValue(user);

    mockLoginPersistence(user, { tokenVersion: 1 });
    const first = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: "correct" });

    expect(first.status).toBe(200);
    const firstAccessToken = first.body.data.accessToken;

    mockLoginPersistence(user, { tokenVersion: 2 });
    const second = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: "correct" });

    expect(second.status).toBe(200);
    expect(second.body.data.accessToken).not.toBe(firstAccessToken);
    expect(user.tokenVersion).toBe(2);

    User.findById.mockImplementation(() => chain(user));
    const stale = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${firstAccessToken}`);

    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe("TOKEN_REVOKED");

    const current = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${second.body.data.accessToken}`);

    expect(current.status).toBe(200);
  });

  it("does not emit cookies on Google login when session persistence fails", async () => {
    const user = makeUser({ googleId: "google-sub-1" });
    User.findOne.mockResolvedValue(user);
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-sub-1",
        email: user.email,
        name: user.name,
        picture: null,
        email_verified: true,
      }),
    });
    User.findOneAndUpdate
      .mockResolvedValueOnce(chain({ ...user, tokenVersion: 1 }))
      .mockRejectedValueOnce(new Error("db write failed"));

    const res = await request(app)
      .post("/api/auth/google-login")
      .set("Origin", ORIGIN)
      .send({ credential: "google-credential" });

    expect(res.status).toBe(500);
    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some((cookie) => cookie.startsWith("__sa_access="))).toBe(false);
    expect(cookies.some((cookie) => cookie.startsWith("__sa_refresh="))).toBe(false);
  });

  it("sets cookies on Google login and bumps tokenVersion", async () => {
    const user = makeUser({ googleId: "google-sub-1" });
    User.findOne.mockResolvedValue(user);
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-sub-1",
        email: user.email,
        name: user.name,
        picture: null,
        email_verified: true,
      }),
    });

    const res = await request(app)
      .post("/api/auth/google-login")
      .set("Origin", ORIGIN)
      .send({ credential: "google-credential" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();

    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some((cookie) => cookie.startsWith("__sa_access="))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("__sa_refresh="))).toBe(true);
    expect(user.tokenVersion).toBe(1);
  });

  it("serves a signed CSRF token through GET /api/auth/csrf", async () => {
    const res = await request(app).get("/api/auth/csrf").set("Origin", ORIGIN);

    expect(res.status).toBe(200);
    expect(verifyCsrfToken(res.body.data.csrfToken)).toBe(true);
    expect(setCookieValue(res, "__sa_csrf")).toBe(res.body.data.csrfToken);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("F-01 CSRF and Origin enforcement", () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    jest.clearAllMocks();
    app = buildApp();
  });

  it("allows safe methods without a CSRF token", async () => {
    const res = await request(app)
      .get("/api/test/protected")
      .set("Cookie", cookieHeader("__sa_access", "access"));

    expect(res.status).toBe(200);
  });

  it("rejects a cookie-authenticated unsafe request with no Origin", async () => {
    const csrf = generateCsrfToken();
    const res = await request(app)
      .post("/api/test/protected")
      .set("Cookie", `__sa_access=access; __sa_csrf=${csrf}`)
      .set("X-CSRF-Token", csrf);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_ORIGIN_INVALID");
  });

  it("rejects a cookie-authenticated unsafe request from an unknown Origin", async () => {
    const csrf = generateCsrfToken();
    const res = await request(app)
      .post("/api/test/protected")
      .set("Origin", "https://evil.example.com")
      .set("Cookie", `__sa_access=access; __sa_csrf=${csrf}`)
      .set("X-CSRF-Token", csrf);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_ORIGIN_INVALID");
  });

  it("rejects missing, mismatched and unsigned CSRF headers", async () => {
    const csrf = generateCsrfToken();

    const missing = await request(app)
      .post("/api/test/protected")
      .set("Origin", ORIGIN)
      .set("Cookie", `__sa_access=access; __sa_csrf=${csrf}`);

    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("CSRF_TOKEN_INVALID");

    const mismatched = await request(app)
      .post("/api/test/protected")
      .set("Origin", ORIGIN)
      .set("Cookie", `__sa_access=access; __sa_csrf=${csrf}`)
      .set("X-CSRF-Token", generateCsrfToken());

    expect(mismatched.status).toBe(403);
    expect(mismatched.body.error.code).toBe("CSRF_TOKEN_INVALID");

    const unsigned = await request(app)
      .post("/api/test/protected")
      .set("Origin", ORIGIN)
      .set("Cookie", "__sa_access=access; __sa_csrf=forged")
      .set("X-CSRF-Token", "forged");

    expect(unsigned.status).toBe(403);
    expect(unsigned.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("accepts a matching signed token and confirms Cache-Control: no-store", async () => {
    const csrf = generateCsrfToken();
    const res = await request(app)
      .post("/api/test/protected")
      .set("Origin", ORIGIN)
      .set("Cookie", `__sa_access=access; __sa_csrf=${csrf}`)
      .set("X-CSRF-Token", csrf);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers.vary).toContain("Cookie");
  });

  it("exempts Bearer-authenticated requests from CSRF", async () => {
    const res = await request(app)
      .post("/api/test/protected")
      .set("Cookie", "__sa_access=access")
      .set("Authorization", "Bearer legacy-token");

    expect(res.status).toBe(200);
  });

  it("keeps public login exempt from CSRF during Wave 1 (transitional)", async () => {
    const user = makeUser();
    User.findByEmailWithPassword.mockResolvedValue(user);

    const res = await request(app)
      .post("/api/auth/login")
      .set("Cookie", "__sa_access=stale")
      .send({ email: user.email, password: "correct" });

    expect(res.status).toBe(200);
  });
});

describe("F-01 refresh rotation, concurrency and reuse", () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    jest.clearAllMocks();
    app = buildApp();
  });

  it("rotates the refresh token, stores only hashes and keeps the same session id", async () => {
    const user = makeUser();
    const oldToken = prepareSession(user);
    const csrf = csrfPair();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `${cookieHeader("__sa_refresh", oldToken)}; ${csrf.cookie}`)
      .set("X-CSRF-Token", csrf.token);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeUndefined();

    const newToken = setCookieValue(res, "__sa_refresh");
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);

    expect(user.refreshTokenHash).toBe(hashToken(newToken));
    expect(user.refreshTokenPrevHash).toBe(hashToken(oldToken));
    expect(user.refreshTokenSessionId).toBe("session-1");
    expect(user.refreshTokenRotatedAt).toBeInstanceOf(Date);
    expect(user.refreshTokenHash).not.toBe(newToken);

    const decoded = verifyRefreshToken(newToken);
    expect(decoded.type).toBe("refresh");
    expect(decoded.sid).toBe("session-1");
    expect(decoded.jti).not.toBe(verifyRefreshToken(oldToken).jti);
  });

  it("returns a deterministic 409 for the previous token inside the conflict window without revoking", async () => {
    const user = makeUser();
    const oldToken = prepareSession(user);
    const csrf = csrfPair();

    const first = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `${cookieHeader("__sa_refresh", oldToken)}; ${csrf.cookie}`)
      .set("X-CSRF-Token", csrf.token);

    expect(first.status).toBe(200);
    const rotatedHash = user.refreshTokenHash;
    const version = user.tokenVersion;

    const secondToken = csrfPair();
    const second = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `${cookieHeader("__sa_refresh", oldToken)}; ${secondToken.cookie}`)
      .set("X-CSRF-Token", secondToken.token);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("REFRESH_TOKEN_CONFLICT");
    expect(second.headers["set-cookie"]).toBeUndefined();
    expect(user.refreshTokenHash).toBe(rotatedHash);
    expect(user.tokenVersion).toBe(version);
  });

  it("revokes the session and bumps tokenVersion when an old token is reused outside the window", async () => {
    const user = makeUser();
    user.tokenVersion = 2;
    const oldToken = generateRefreshToken(user, { sessionId: "session-1" });

    user.refreshTokenHash = hashToken("newer-token");
    user.refreshTokenPrevHash = hashToken(oldToken);
    user.refreshTokenSessionId = "session-1";
    user.refreshTokenRotatedAt = new Date(Date.now() - 60_000);
    User.findById.mockImplementation(() => chain(user));

    const csrf = csrfPair();
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `${cookieHeader("__sa_refresh", oldToken)}; ${csrf.cookie}`)
      .set("X-CSRF-Token", csrf.token);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REFRESH_TOKEN_REUSED");
    expect(user.tokenVersion).toBe(3);
    expect(user.refreshTokenHash).toBeNull();
    expect(user.refreshTokenPrevHash).toBeNull();
    expect(user.refreshTokenSessionId).toBeNull();
    expect(user.save).toHaveBeenCalled();
  });

  it("does not hand the replacement token to a CAS loser and does not destroy the winner session", async () => {
    const user = makeUser();
    const token = prepareSession(user);

    const winner = {
      ...user,
      refreshTokenHash: hashToken("winner-token"),
      refreshTokenPrevHash: hashToken(token),
      refreshTokenRotatedAt: new Date(),
      tokenVersion: user.tokenVersion,
    };

    User.findOneAndUpdate.mockResolvedValue(null);
    User.findById
      .mockImplementationOnce(() => chain(user))
      .mockImplementationOnce(() => chain(winner));

    const csrf = csrfPair();
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `${cookieHeader("__sa_refresh", token)}; ${csrf.cookie}`)
      .set("X-CSRF-Token", csrf.token);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("REFRESH_TOKEN_CONFLICT");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(winner.refreshTokenHash).toBe(hashToken("winner-token"));
    expect(winner.tokenVersion).toBe(user.tokenVersion);
  });

  it("rejects a refresh JWT with the wrong type or missing jti/type contract", () => {
    const accessToken = generateAccessToken(makeUser());
    expect(() => verifyRefreshToken(accessToken)).toThrow();

    const jwt = require("jsonwebtoken");
    const untyped = jwt.sign({ id: USER_ID }, process.env.JWT_REFRESH_SECRET);
    expect(() => verifyRefreshToken(untyped)).toThrow();
  });

  it("produces different jti values for tokens minted in the same second", () => {
    const user = makeUser();
    const first = generateRefreshToken(user, { sessionId: "session-1" });
    const second = generateRefreshToken(user, { sessionId: "session-1" });

    expect(first).not.toBe(second);
    expect(verifyRefreshToken(first).jti).not.toBe(verifyRefreshToken(second).jti);
  });
});

describe("F-01 cookie refresh CSRF enforcement", () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    jest.clearAllMocks();
    app = buildApp();
  });

  it("rejects a cookie-only refresh with no Origin", async () => {
    const user = makeUser();
    const token = prepareSession(user);
    const csrf = csrfPair();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `${cookieHeader("__sa_refresh", token)}; ${csrf.cookie}`)
      .set("X-CSRF-Token", csrf.token);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_ORIGIN_INVALID");
  });

  it("rejects a cookie-only refresh from an unknown Origin", async () => {
    const user = makeUser();
    const token = prepareSession(user);
    const csrf = csrfPair();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", "https://evil.example.com")
      .set("Cookie", `${cookieHeader("__sa_refresh", token)}; ${csrf.cookie}`)
      .set("X-CSRF-Token", csrf.token);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_ORIGIN_INVALID");
  });

  it("rejects a cookie-only refresh with a missing CSRF token", async () => {
    const user = makeUser();
    const token = prepareSession(user);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", cookieHeader("__sa_refresh", token));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("rejects a cookie-only refresh with a mismatched CSRF token", async () => {
    const user = makeUser();
    const token = prepareSession(user);
    const csrf = csrfPair();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `${cookieHeader("__sa_refresh", token)}; ${csrf.cookie}`)
      .set("X-CSRF-Token", generateCsrfToken());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("rejects a cookie-only refresh with an invalid CSRF signature", async () => {
    const user = makeUser();
    const token = prepareSession(user);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", "__sa_refresh=" + token + "; __sa_csrf=forged")
      .set("X-CSRF-Token", "forged");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("allows a cookie-only refresh when CSRF is valid and proceeds to rotation", async () => {
    const user = makeUser();
    const token = prepareSession(user);
    const csrf = csrfPair();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `${cookieHeader("__sa_refresh", token)}; ${csrf.cookie}`)
      .set("X-CSRF-Token", csrf.token);

    expect(res.status).toBe(200);
    expect(setCookieValue(res, "__sa_refresh")).toBeTruthy();
  });

  it("keeps the legacy body-token refresh CSRF-exempt (documented exception)", async () => {
    const user = makeUser();
    const token = prepareSession(user);

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: token });

    expect(res.status).toBe(200);
  });
});

describe("F-01 cookie authentication and revocation", () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    jest.clearAllMocks();
    app = buildApp();
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  it("authenticates protect via the access cookie and marks the response no-store", async () => {
    const user = makeUser();
    User.findById.mockImplementation(() => chain(user));
    const accessToken = generateAccessToken(user);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookieHeader("__sa_access", accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers.vary).toContain("Cookie");
  });

  it("keeps Bearer authentication working", async () => {
    const user = makeUser();
    User.findById.mockImplementation(() => chain(user));
    const accessToken = generateAccessToken(user);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });

  it("revokes the session and clears cookies on logout", async () => {
    const user = makeUser();
    User.findById.mockImplementation(() => chain(user));
    const accessToken = generateAccessToken(user);

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        $inc: { tokenVersion: 1 },
        $set: expect.objectContaining({
          refreshTokenHash: null,
          refreshTokenPrevHash: null,
          refreshTokenSessionId: null,
          refreshTokenRotatedAt: null,
        }),
      }),
    );

    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some((cookie) => cookie.startsWith("__sa_access=;"))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("__sa_refresh=;"))).toBe(true);
  });

  it("requires CSRF for a cookie-authenticated logout", async () => {
    const user = makeUser();
    User.findById.mockImplementation(() => chain(user));
    const accessToken = generateAccessToken(user);

    const blocked = await request(app)
      .post("/api/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", cookieHeader("__sa_access", accessToken));

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("CSRF_TOKEN_INVALID");

    const csrf = generateCsrfToken();
    const allowed = await request(app)
      .post("/api/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", `__sa_access=${accessToken}; __sa_csrf=${csrf}`)
      .set("X-CSRF-Token", csrf);

    expect(allowed.status).toBe(200);
  });

  it("revokes the refresh session and clears cookies on password change", async () => {
    const user = makeUser({
      tokenVersion: 0,
      refreshTokenHash: hashToken("old-refresh"),
      refreshTokenPrevHash: hashToken("older-refresh"),
      refreshTokenSessionId: "session-1",
      refreshTokenRotatedAt: new Date(),
    });
    user.comparePassword = jest.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    User.findById.mockImplementation(() => chain(user));
    const accessToken = generateAccessToken(user);

    const res = await request(app)
      .put("/api/profile/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: "current",
        newPassword: "new-password",
        confirmPassword: "new-password",
      });

    expect(res.status).toBe(200);
    expect(user.tokenVersion).toBe(1);
    expect(user.refreshTokenHash).toBeNull();
    expect(user.refreshTokenPrevHash).toBeNull();
    expect(user.refreshTokenSessionId).toBeNull();
    expect(user.refreshTokenRotatedAt).toBeNull();

    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some((cookie) => cookie.startsWith("__sa_access=;"))).toBe(true);
  });
});
