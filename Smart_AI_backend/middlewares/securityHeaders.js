const helmet = require('helmet');

// Backend Helmet headers protect only responses served by this Express app
// (API responses, /api-docs, /test-chat, static avatars). They do NOT govern
// the Vercel-hosted frontend HTML, which needs its own CSP configured on Vercel.
// accounts.google.com stays allowed for backend-served pages and forward safety.

const isProduction = () => process.env.NODE_ENV === 'production';

const securityHeaders = () => {
  const directives = {
    baseUri: ["'self'"],
    connectSrc: ["'self'", 'https://accounts.google.com'],
    defaultSrc: ["'self'"],
    fontSrc: ["'self'", 'https:', 'data:'],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    frameSrc: ["'self'", 'https://accounts.google.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    objectSrc: ["'none'"],
    scriptSrc: isProduction()
      ? ["'self'", 'https://accounts.google.com']
      : ["'self'", "'unsafe-inline'", 'https://accounts.google.com', 'https://cdn.socket.io'],
    styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
  };

  if (isProduction()) {
    directives.upgradeInsecureRequests = [];
  }

  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: isProduction()
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
  });
};

module.exports = securityHeaders;
