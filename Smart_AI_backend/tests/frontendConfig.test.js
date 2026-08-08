"use strict";

/**
 * Unit tests for getFrontendBaseUrl() — the single source of truth for the
 * frontend origin used in emails and auth redirects.
 *
 * These tests never depend on the developer machine's localhost/FRONTEND_URL
 * value: every case sets process.env.FRONTEND_URL explicitly (or deletes it)
 * and restores it afterwards.
 */
const { getFrontendBaseUrl, DEFAULT_FRONTEND_URL } = require("../configs/frontendConfig");

function withEnv(value, fn) {
  const prev = process.env.FRONTEND_URL;
  try {
    if (value === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = value;
    return fn();
  } finally {
    if (prev === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prev;
  }
}

describe("getFrontendBaseUrl", () => {
  it("falls back to the local dev origin when FRONTEND_URL is not set", () => {
    withEnv(undefined, () => {
      expect(getFrontendBaseUrl()).toBe(DEFAULT_FRONTEND_URL);
    });
  });

  it("uses the configured production HTTPS origin when FRONTEND_URL is set", () => {
    withEnv("https://shop.example.com", () => {
      expect(getFrontendBaseUrl()).toBe("https://shop.example.com");
    });
  });

  it("normalizes a trailing slash from the configured URL", () => {
    withEnv("https://shop.example.com/", () => {
      expect(getFrontendBaseUrl()).toBe("https://shop.example.com");
    });
  });

  it("normalizes multiple trailing slashes", () => {
    withEnv("https://shop.example.com///", () => {
      expect(getFrontendBaseUrl()).toBe("https://shop.example.com");
    });
  });

  it("trims surrounding whitespace from the configured URL", () => {
    withEnv("  https://shop.example.com  ", () => {
      expect(getFrontendBaseUrl()).toBe("https://shop.example.com");
    });
  });

  it("always reads the current env value on each call", () => {
    withEnv("https://first.example.com", () => {
      expect(getFrontendBaseUrl()).toBe("https://first.example.com");
      process.env.FRONTEND_URL = "https://second.example.com";
      expect(getFrontendBaseUrl()).toBe("https://second.example.com");
    });
  });
});