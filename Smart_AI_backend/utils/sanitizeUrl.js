const SENSITIVE_KEYS = new Set([
  'token',
  'accesstoken',
  'refreshtoken',
  'resettoken',
  'verificationtoken',
  'credential',
  'code',
  'apikey',
  'key',
  'secret',
  'password',
  'email',
]);

function sanitizeUrl(originalUrl) {
  if (!originalUrl) return '/';

  const qIndex = originalUrl.indexOf('?');
  if (qIndex === -1) return originalUrl;

  const pathname = originalUrl.slice(0, qIndex);
  const qs = originalUrl.slice(qIndex + 1);

  if (qs.length === 0) return originalUrl;

  let redacted = false;
  const parts = qs.split('&');
  const result = parts.map((part) => {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) {
      const key = decodeURIComponent(part);
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        redacted = true;
        return `${part}=[REDACTED]`;
      }
      return part;
    }
    const rawKey = part.slice(0, eqIndex);
    const key = decodeURIComponent(rawKey);
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      redacted = true;
      return `${rawKey}=[REDACTED]`;
    }
    return part;
  });

  if (!redacted) return originalUrl;

  return `${pathname}?${result.join('&')}`;
}

module.exports = sanitizeUrl;
