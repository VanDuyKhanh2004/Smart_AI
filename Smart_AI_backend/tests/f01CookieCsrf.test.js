"use strict";

const {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  ACCESS_COOKIE_PATH,
  REFRESH_COOKIE_PATH,
  CSRF_COOKIE_PATH,
  parseDurationToMs,
  setAuthCookies,
  setCsrfCookie,
  clearAuthCookies,
  applyRefreshSession,
  clearRefreshSession,
  isWithinRefreshConflictWindow,
  REFRESH_CONFLICT_WINDOW_MS,
} = require("../configs/authCookies");
const { parseCookieHeader } = require("../utils/cookies");
const { hashToken, hashMatches, timingSafeEqualStrings } = require("../utils/tokenHash");
const {
  generateCsrfToken,
  verifyCsrfToken,
  validateCsrfSecret,
} = require("../utils/csrf");
const {
  isOriginAllowed,
  getAllowedOrigins,
  corsOrigin,
} = require("../configs/frontendConfig");
const {
  MARKER,
  buildFilter,
  buildUpdate,
  parseArgs,
  runBump,
} = require("../scripts/bumpF01TokenVersion");

function fakeRes() {
  const calls = { cookies: [], cleared: [] };
  return {
    calls,
    cookie: (...args) => calls.cookies.push(args),
    clearCookie: (...args) => calls.cleared.push(args),
  };
}

describe("F-01 cookie header parser", () => {
  it("parses multiple cookies with surrounding whitespace", () => {
    const cookies = parseCookieHeader(" a = 1 ; b=two ; c =three");
    expect(cookies.a).toBe("1");
    expect(cookies.b).toBe("two");
    expect(cookies.c).toBe("three");
  });

  it("returns a null-prototype object and ignores malformed segments", () => {
    const cookies = parseCookieHeader("valid=1; broken; =nameless; empty=");
    expect(Object.getPrototypeOf(cookies)).toBeNull();
    expect(cookies.valid).toBe("1");
    expect(cookies.empty).toBe("");
    expect(Object.prototype.hasOwnProperty.call(cookies, "broken")).toBe(false);
  });

  it("keeps the first duplicate cookie name (most specific path wins)", () => {
    const cookies = parseCookieHeader("a=first; a=second");
    expect(cookies.a).toBe("first");
  });

  it("decodes URL-encoded values, quoted values and malformed escapes", () => {
    const cookies = parseCookieHeader('a=hello%20world; b="quoted%20value"; c=%E0%A4%A');
    expect(cookies.a).toBe("hello world");
    expect(cookies.b).toBe("quoted value");
    expect(cookies.c).toBe("%E0%A4%A");
  });

  it("cannot pollute Object.prototype through a __proto__ cookie", () => {
    const cookies = parseCookieHeader("__proto__=polluted; constructor=bad");
    expect(cookies.__proto__).toBe("polluted");
    expect({}.polluted).toBeUndefined();
  });

  it("returns an empty null-prototype object for missing headers", () => {
    const cookies = parseCookieHeader(undefined);
    expect(Object.keys(cookies)).toHaveLength(0);
    expect(Object.getPrototypeOf(cookies)).toBeNull();
  });
});

describe("F-01 cookie attributes and clearing", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("sets access, refresh and CSRF cookies with the approved attributes in test", () => {
    process.env.NODE_ENV = "test";
    const res = fakeRes();

    setAuthCookies(res, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      csrfToken: "csrf-token",
    });

    expect(res.calls.cookies).toHaveLength(3);

    const [accessName, accessValue, accessOptions] = res.calls.cookies[0];
    expect(accessName).toBe(ACCESS_COOKIE_NAME);
    expect(accessValue).toBe("access-token");
    expect(accessOptions).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: ACCESS_COOKIE_PATH,
        maxAge: 15 * 60 * 1000,
      }),
    );

    const [refreshName, refreshValue, refreshOptions] = res.calls.cookies[1];
    expect(refreshName).toBe(REFRESH_COOKIE_NAME);
    expect(refreshValue).toBe("refresh-token");
    expect(refreshOptions).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: REFRESH_COOKIE_PATH,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }),
    );

    const [csrfName, csrfValue, csrfOptions] = res.calls.cookies[2];
    expect(csrfName).toBe(CSRF_COOKIE_NAME);
    expect(csrfValue).toBe("csrf-token");
    expect(csrfOptions).toEqual(
      expect.objectContaining({
        httpOnly: false,
        secure: false,
        sameSite: "lax",
        path: CSRF_COOKIE_PATH,
      }),
    );
    expect(accessOptions).not.toHaveProperty("domain");
    expect(refreshOptions).not.toHaveProperty("domain");
    expect(csrfOptions).not.toHaveProperty("domain");
  });

  it("marks every cookie Secure in production", () => {
    process.env.NODE_ENV = "production";
    const res = fakeRes();

    setAuthCookies(res, {
      accessToken: "a",
      refreshToken: "r",
      csrfToken: "c",
    });

    for (const [, , options] of res.calls.cookies) {
      expect(options.secure).toBe(true);
    }
  });

  it("does not set a CSRF cookie when no token is supplied", () => {
    process.env.NODE_ENV = "test";
    const res = fakeRes();

    setAuthCookies(res, { accessToken: "a", refreshToken: "r" });

    expect(res.calls.cookies).toHaveLength(2);
    expect(res.calls.cookies.map((call) => call[0])).not.toContain(CSRF_COOKIE_NAME);
  });

  it("clears cookies using the same Path and attributes as when they were set", () => {
    process.env.NODE_ENV = "production";
    const res = fakeRes();

    clearAuthCookies(res);

    expect(res.calls.cleared).toHaveLength(3);
    const access = res.calls.cleared.find((call) => call[0] === ACCESS_COOKIE_NAME);
    const refresh = res.calls.cleared.find((call) => call[0] === REFRESH_COOKIE_NAME);
    const csrf = res.calls.cleared.find((call) => call[0] === CSRF_COOKIE_NAME);

    expect(access[1]).toEqual(
      expect.objectContaining({ path: ACCESS_COOKIE_PATH, httpOnly: true, secure: true, sameSite: "lax" }),
    );
    expect(refresh[1]).toEqual(
      expect.objectContaining({ path: REFRESH_COOKIE_PATH, httpOnly: true, secure: true, sameSite: "lax" }),
    );
    expect(csrf[1]).toEqual(
      expect.objectContaining({ path: CSRF_COOKIE_PATH, httpOnly: false, secure: true, sameSite: "lax" }),
    );
  });

  it("sets only the JS-readable CSRF cookie from setCsrfCookie", () => {
    const res = fakeRes();
    setCsrfCookie(res, "signed-csrf");

    expect(res.calls.cookies).toHaveLength(1);
    expect(res.calls.cookies[0][0]).toBe(CSRF_COOKIE_NAME);
    expect(res.calls.cookies[0][2].httpOnly).toBe(false);
  });

  it("parses JWT-style durations and falls back on invalid values", () => {
    expect(parseDurationToMs("15m", 0)).toBe(15 * 60 * 1000);
    expect(parseDurationToMs("7d", 0)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDurationToMs("3600", 0)).toBe(3600 * 1000);
    expect(parseDurationToMs("bogus", 123)).toBe(123);
    expect(parseDurationToMs("-5m", 456)).toBe(456);
  });
});

describe("F-01 refresh-session helpers", () => {
  it("stores and clears only the hashed session fields", () => {
    const user = {};
    applyRefreshSession(user, {
      tokenHash: "current-hash",
      previousHash: "previous-hash",
      sessionId: "sid-1",
      rotatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(user.refreshTokenHash).toBe("current-hash");
    expect(user.refreshTokenPrevHash).toBe("previous-hash");
    expect(user.refreshTokenSessionId).toBe("sid-1");
    expect(user.refreshTokenRotatedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(user.refreshToken).toBeUndefined();

    clearRefreshSession(user);

    expect(user.refreshTokenHash).toBeNull();
    expect(user.refreshTokenPrevHash).toBeNull();
    expect(user.refreshTokenSessionId).toBeNull();
    expect(user.refreshTokenRotatedAt).toBeNull();
  });

  it("recognises only the short conflict window", () => {
    const now = Date.now();
    expect(isWithinRefreshConflictWindow(new Date(now), now)).toBe(true);
    expect(isWithinRefreshConflictWindow(new Date(now - REFRESH_CONFLICT_WINDOW_MS), now)).toBe(true);
    expect(isWithinRefreshConflictWindow(new Date(now - REFRESH_CONFLICT_WINDOW_MS - 1), now)).toBe(false);
    expect(isWithinRefreshConflictWindow(null, now)).toBe(false);
  });
});

describe("F-01 signed CSRF tokens", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.CSRF_SECRET;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.CSRF_SECRET = "c".repeat(64);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret === undefined) delete process.env.CSRF_SECRET;
    else process.env.CSRF_SECRET = originalSecret;
  });

  it("generates a signed token that verifies", () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{64}$/);
    expect(verifyCsrfToken(token)).toBe(true);
  });

  it("rejects a tampered nonce, tampered signature, malformed value and missing token", () => {
    const token = generateCsrfToken();
    const [nonce, signature] = token.split(".");

    expect(verifyCsrfToken(`${nonce.slice(0, -1)}0.${signature}`)).toBe(false);
    expect(verifyCsrfToken(`${nonce}.${signature.slice(0, -1)}0`)).toBe(false);
    expect(verifyCsrfToken(`${nonce}.${signature}.extra`)).toBe(false);
    expect(verifyCsrfToken(nonce)).toBe(false);
    expect(verifyCsrfToken("")).toBe(false);
    expect(verifyCsrfToken(undefined)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const token = generateCsrfToken();
    process.env.CSRF_SECRET = "d".repeat(64);
    expect(verifyCsrfToken(token)).toBe(false);
  });

  it("fails production validation for a missing or short secret", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CSRF_SECRET;
    expect(validateCsrfSecret()).toHaveLength(1);

    process.env.CSRF_SECRET = "short";
    expect(validateCsrfSecret()).toHaveLength(1);

    process.env.CSRF_SECRET = "x".repeat(32);
    expect(validateCsrfSecret()).toEqual([]);
  });

  it("allows an ephemeral secret outside production", () => {
    process.env.NODE_ENV = "test";
    delete process.env.CSRF_SECRET;
    expect(validateCsrfSecret()).toEqual([]);
    expect(verifyCsrfToken(generateCsrfToken())).toBe(true);
  });
});

describe("F-01 origin allowlist", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFrontend = process.env.FRONTEND_URL;
  const originalExtra = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontend;
    if (originalExtra === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = originalExtra;
  });

  it("uses exact matches in production and never trusts the dev ports", () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://shop.example.com/";
    process.env.CORS_ALLOWED_ORIGINS = "https://admin.example.com";

    expect(isOriginAllowed("https://shop.example.com")).toBe(true);
    expect(isOriginAllowed("https://admin.example.com")).toBe(true);
    expect(isOriginAllowed("https://shop.example.com.evil.test")).toBe(false);
    expect(isOriginAllowed("http://localhost:5173")).toBe(false);
    expect(isOriginAllowed(undefined)).toBe(false);
    expect(getAllowedOrigins()).toEqual([
      "https://shop.example.com",
      "https://admin.example.com",
    ]);
  });

  it("allows the configured Vite dev ports outside production", () => {
    process.env.NODE_ENV = "test";
    process.env.FRONTEND_URL = "http://localhost:5173";
    delete process.env.CORS_ALLOWED_ORIGINS;

    expect(isOriginAllowed("http://localhost:5173")).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:5173")).toBe(true);
    expect(isOriginAllowed("http://localhost:5174")).toBe(true);
    expect(isOriginAllowed("http://localhost:4173")).toBe(true);
    expect(isOriginAllowed("https://evil.example.com")).toBe(false);
  });

  it("lets non-browser requests through CORS but rejects unknown browser origins", (done) => {
    corsOrigin(undefined, (err, allowed) => {
      expect(err).toBeNull();
      expect(allowed).toBe(true);

      corsOrigin("https://evil.example.com", (err2, allowed2) => {
        expect(err2).toBeNull();
        expect(allowed2).toBe(false);
        done();
      });
    });
  });
});

describe("F-01 hash and constant-time comparison", () => {
  it("matches only the exact raw token and never the raw value itself", () => {
    const raw = "refresh-token-value";
    const digest = hashToken(raw);

    expect(hashMatches(raw, digest)).toBe(true);
    expect(hashMatches("other", digest)).toBe(false);
    expect(hashMatches(raw, "")).toBe(false);
    expect(digest).not.toContain(raw);
  });

  it("compares equal-length strings without throwing and rejects unequal lengths", () => {
    expect(timingSafeEqualStrings("abc", "abc")).toBe(true);
    expect(timingSafeEqualStrings("abc", "abd")).toBe(false);
    expect(timingSafeEqualStrings("abc", "abcd")).toBe(false);
    expect(timingSafeEqualStrings(null, "abc")).toBe(false);
  });
});

describe("F-01 tokenVersion migration script", () => {
  it("builds an idempotent filter and a bump/clear/session-wipe update", () => {
    expect(buildFilter()).toEqual({ f01TokenVersionBumpMarker: { $ne: MARKER } });

    const now = new Date("2026-01-01T00:00:00Z");
    const update = buildUpdate(now);

    expect(update.$inc).toEqual({ tokenVersion: 1 });
    expect(update.$set).toEqual(
      expect.objectContaining({
        f01TokenVersionBumpMarker: MARKER,
        f01TokenVersionBumpedAt: now,
        refreshTokenHash: null,
        refreshTokenPrevHash: null,
        refreshTokenSessionId: null,
        refreshTokenRotatedAt: null,
      }),
    );
    expect(update.$unset).toEqual({ refreshToken: "" });
  });

  it("defaults to dry-run and requires --apply for writes", () => {
    expect(parseArgs(["node", "script"])).toEqual({ dryRun: true });
    expect(parseArgs(["node", "script", "--dry-run"])).toEqual({ dryRun: true });
    expect(parseArgs(["node", "script", "--apply"])).toEqual({ dryRun: false });
    expect(() => parseArgs(["node", "script", "--apply", "--dry-run"])).toThrow();
    expect(() => parseArgs(["node", "script", "--force"])).toThrow();
  });

  it("dry-run counts candidates without writing", async () => {
    const model = {
      countDocuments: jest.fn().mockResolvedValue(4),
      updateMany: jest.fn(),
    };
    const markers = {
      getStatus: jest.fn().mockResolvedValue(null),
      claim: jest.fn(),
      complete: jest.fn(),
    };

    const result = await runBump({ model, markers, dryRun: true });

    expect(result).toEqual(
      expect.objectContaining({ dryRun: true, candidates: 4, matched: 0, modified: 0 }),
    );
    expect(model.updateMany).not.toHaveBeenCalled();
    expect(markers.claim).not.toHaveBeenCalled();
  });

  it("apply writes once and a second run is a no-op (global marker)", async () => {
    const docs = [
      { _id: "u1", tokenVersion: 0 },
      { _id: "u2", tokenVersion: 5, f01TokenVersionBumpMarker: MARKER },
    ];

    const model = {
      countDocuments: jest.fn(async (filter) => {
        expect(filter).toEqual({ f01TokenVersionBumpMarker: { $ne: MARKER } });
        return docs.filter((doc) => doc.f01TokenVersionBumpMarker !== MARKER).length;
      }),
      updateMany: jest.fn(async (filter, update) => {
        const targets = docs.filter((doc) => doc.f01TokenVersionBumpMarker !== MARKER);
        for (const doc of targets) {
          doc.tokenVersion += update.$inc.tokenVersion;
          Object.assign(doc, update.$set);
          delete doc.refreshToken;
        }
        return { matchedCount: targets.length, modifiedCount: targets.length };
      }),
    };

    const markerStore = {
      status: null,
      async getStatus() {
        return this.status === "completed" ? "completed" : null;
      },
      async claim({ runId }) {
        if (this.status === "completed") {
          return { claimed: false, status: "completed" };
        }
        if (this.status === "running") {
          return { claimed: false, status: "running" };
        }
        this.status = "running";
        this.runId = runId;
        return { claimed: true, status: "running" };
      },
      async complete({ runId }) {
        if (this.runId !== runId) return false;
        this.status = "completed";
        return true;
      },
    };

    const first = await runBump({ model, markers: markerStore, dryRun: false });
    expect(first).toEqual(
      expect.objectContaining({ dryRun: false, alreadyApplied: false, candidates: 1, matched: 1, modified: 1 }),
    );
    expect(docs[0].tokenVersion).toBe(1);
    expect(docs[0].f01TokenVersionBumpMarker).toBe(MARKER);
    expect(docs[1].tokenVersion).toBe(5);

    const second = await runBump({ model, markers: markerStore, dryRun: false });
    expect(second).toEqual(
      expect.objectContaining({ dryRun: false, alreadyApplied: true, matched: 0, modified: 0 }),
    );
    expect(docs[0].tokenVersion).toBe(1);
    expect(docs[1].tokenVersion).toBe(5);
    expect(model.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not touch users created after a completed migration", async () => {
    const docs = [{ _id: "u1", tokenVersion: 0 }];
    const model = {
      countDocuments: jest.fn(async () => docs.filter((doc) => doc.f01TokenVersionBumpMarker !== MARKER).length),
      updateMany: jest.fn(async (filter, update) => {
        const targets = docs.filter((doc) => doc.f01TokenVersionBumpMarker !== MARKER);
        for (const doc of targets) {
          doc.tokenVersion += update.$inc.tokenVersion;
          Object.assign(doc, update.$set);
        }
        return { matchedCount: targets.length, modifiedCount: targets.length };
      }),
    };

    const markerStore = {
      status: "completed",
      async getStatus() {
        return "completed";
      },
      async claim() {
        return { claimed: false, status: "completed" };
      },
      async complete() {
        return true;
      },
    };

    const result = await runBump({ model, markers: markerStore, dryRun: false });

    expect(result.alreadyApplied).toBe(true);
    expect(model.updateMany).not.toHaveBeenCalled();
    expect(docs[0].tokenVersion).toBe(0);

    docs.push({ _id: "new-user", tokenVersion: 0 });
    const second = await runBump({ model, markers: markerStore, dryRun: false });
    expect(second.alreadyApplied).toBe(true);
    expect(docs[1].tokenVersion).toBe(0);
  });

  it("aborts concurrent invocations without a second write", async () => {
    const model = {
      countDocuments: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    };

    const markerStore = {
      status: null,
      async getStatus() {
        return this.status;
      },
      async claim() {
        if (this.status === null) {
          this.status = "running";
          return { claimed: true, status: "running" };
        }
        return { claimed: false, status: this.status };
      },
      async complete() {
        this.status = "completed";
        return true;
      },
    };

    const [first, second] = await Promise.allSettled([
      runBump({ model, markers: markerStore, dryRun: false }),
      runBump({ model, markers: markerStore, dryRun: false }),
    ]);

    const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
    const rejected = [first, second].filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(model.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("F-01 logging redaction configuration", () => {
  it("redacts CSRF credentials and refresh-session digests", () => {
    const logger = require("../utils/logger");
    const paths = logger.redactionPaths || [];

    expect(paths).toEqual(
      expect.arrayContaining([
        "refreshToken",
        "refreshTokenHash",
        "refreshTokenPrevHash",
        "refreshTokenSessionId",
        "csrfToken",
        "csrfSecret",
        "x-csrf-token",
        "CSRF_SECRET",
        "cookie",
        "set-cookie",
      ]),
    );
  });
});
