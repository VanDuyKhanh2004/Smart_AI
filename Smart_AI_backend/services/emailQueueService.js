const crypto = require('crypto');
const logger = require('../utils/logger');
const queueRegistry = require('../queues/queueRegistry');
const emailService = require('./emailService');

const QUEUE_NAME = 'emailQueue';

function getQueue() {
  return queueRegistry.get(QUEUE_NAME);
}

async function enqueue(jobType, payload, jobId) {
  const cid = payload.correlationId || null;
  const logMeta = { jobType, correlationId: cid };

  const queue = getQueue();

  if (!queue) {
    logger.warn(logMeta, 'Email queue not available, sending directly');
    fireAndForgetDirect(jobType, payload);
    return;
  }

  try {
    const job = await queue.add(jobType, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100, age: 3600 * 24 },
      removeOnFail: { count: 50, age: 3600 * 24 * 7 },
    });
    logger.info({ ...logMeta, jobId: job.id }, 'Email job enqueued');
  } catch (err) {
    logger.error({ ...logMeta, err: { message: err.message } }, 'Failed to enqueue email job, sending directly');
    fireAndForgetDirect(jobType, payload);
  }
}

function fireAndForgetDirect(jobType, payload) {
  const promise = sendDirect(jobType, payload);
  promise.catch((err) => {
    logger.error({ jobType, err: { message: err.message } }, 'Direct email fallback failed');
  });
}

async function sendDirect(jobType, payload) {
  const user = { name: payload.name, email: payload.to };

  switch (jobType) {
    case 'email.welcome':
      return emailService.sendWelcomeEmail(user);
    case 'email.verification':
      return emailService.sendVerificationEmail(user, payload.verifyUrl);
    case 'email.password-reset':
      return emailService.sendPasswordResetEmail(user, payload.resetUrl);
    case 'email.unlock-account':
      return emailService.sendUnlockAccountEmail(user, payload.unlockUrl);
    case 'email.order-confirmation':
      return emailService.sendOrderConfirmationEmail(user, payload.order);
    default:
      logger.warn({ jobType }, 'Unknown email type in direct fallback');
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function enqueueWelcomeEmail(user, correlationId) {
  const payload = {
    jobType: 'email.welcome',
    to: user.email,
    name: user.name,
    correlationId,
  };
  return enqueue('email.welcome', payload, `welcome-${user._id}`);
}

function enqueueVerificationEmail(user, verifyUrl, correlationId) {
  const tokenHash = hashToken(verifyUrl);
  const payload = {
    jobType: 'email.verification',
    to: user.email,
    name: user.name,
    verifyUrl,
    correlationId,
  };
  return enqueue('email.verification', payload, `verification-${tokenHash}`);
}

function enqueuePasswordResetEmail(user, resetUrl, correlationId) {
  const tokenHash = hashToken(resetUrl);
  const payload = {
    jobType: 'email.password-reset',
    to: user.email,
    name: user.name,
    resetUrl,
    correlationId,
  };
  return enqueue('email.password-reset', payload, `password-reset-${tokenHash}`);
}

function enqueueUnlockAccountEmail(user, unlockUrl, correlationId) {
  const tokenHash = hashToken(unlockUrl);
  const payload = {
    jobType: 'email.unlock-account',
    to: user.email,
    name: user.name,
    unlockUrl,
    correlationId,
  };
  return enqueue('email.unlock-account', payload, `unlock-${tokenHash}`);
}

function enqueueOrderConfirmationEmail(user, order, correlationId) {
  const payload = {
    jobType: 'email.order-confirmation',
    to: user.email,
    name: user.name || order.shippingAddress?.fullName,
    order,
    correlationId,
  };
  return enqueue('email.order-confirmation', payload, `order-confirmation-${order._id || order.orderNumber}`);
}

module.exports = {
  enqueueWelcomeEmail,
  enqueueVerificationEmail,
  enqueuePasswordResetEmail,
  enqueueUnlockAccountEmail,
  enqueueOrderConfirmationEmail,
  QUEUE_NAME,
};
