const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
// Under Jest (NODE_ENV=test or JEST_WORKER_ID set) the pino-pretty worker
// transport leaks an open WORKER/MESSAGEPORT handle that keeps the test
// process alive. Production must emit structured JSON anyway, so both modes
// avoid the pretty worker entirely; local `npm run dev` keeps it.
const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
const usePrettyTransport = !isProduction && !isTest;

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(usePrettyTransport
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  redact: {
    paths: [
      'password',
      'newPassword',
      'oldPassword',
      'token',
      'accessToken',
      'refreshToken',
      'credential',
      'authorization',
      'apiKey',
      'x-api-key',
      'x-api-secret',
      'cookie',
      'set-cookie',
      'setCookie',
      'emailVerificationToken',
      'passwordResetToken',
      'unlockToken',
      'OPENAI_API_KEY',
      'BREVO_API_KEY',
      'GOOGLE_CLIENT_SECRET',
      'req.headers.authorization',
      'embedding_vector',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
