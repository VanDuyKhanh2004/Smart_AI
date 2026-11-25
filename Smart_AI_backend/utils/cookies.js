"use strict";

/**
 * Minimal Cookie request-header parser.
 *
 * The project intentionally does not add a cookie-parser dependency in
 * Wave 1. The parser only needs to read a handful of application cookies
 * whose values are base64url/JWT-safe, but it still handles quoted values,
 * surrounding whitespace, empty values, URL-encoded values and duplicate
 * names deterministically.
 *
 * Duplicate cookie names: the first occurrence wins. Browsers send cookies
 * ordered by path specificity, so the first value is the most specific one.
 *
 * The returned object has a null prototype so a cookie named "__proto__"
 * cannot mutate Object.prototype.
 */
function parseCookieHeader(header) {
  const cookies = Object.create(null);

  if (typeof header !== "string" || header.length === 0) {
    return cookies;
  }

  const parts = header.split(";");

  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    if (!name || Object.prototype.hasOwnProperty.call(cookies, name)) {
      continue;
    }

    let value = part.slice(separator + 1).trim();

    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the raw value when it is not valid percent-encoding. Treating it
      // as a literal value keeps verification deterministic instead of
      // throwing from an untrusted request header.
    }

    cookies[name] = value;
  }

  return cookies;
}

module.exports = { parseCookieHeader };
