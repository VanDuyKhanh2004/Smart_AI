const logger = require('../utils/logger');
const emailService = require('../services/emailService');

async function processJob(job) {
  const startedAt = Date.now();
  const { jobType } = job.data;
  const correlationId = job.data.correlationId || job.data.requestId || null;

  const logContext = {
    jobId: job.id,
    jobName: job.name,
    emailType: jobType,
    correlationId,
    attemptsMade: job.attemptsMade,
  };

  logger.info(logContext, 'Email job started');

  try {
    let result;
    switch (jobType) {
      case 'email.welcome':
        result = await processWelcome(job);
        break;
      case 'email.verification':
        result = await processVerification(job);
        break;
      case 'email.password-reset':
        result = await processPasswordReset(job);
        break;
      case 'email.unlock-account':
        result = await processUnlockAccount(job);
        break;
      case 'email.order-confirmation':
        result = await processOrderConfirmation(job);
        break;
      default:
        throw new Error(`Unknown email job type: ${jobType}`);
    }
    const durationMs = Date.now() - startedAt;
    logger.info({ ...logContext, durationMs }, 'Email job completed');
    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    logger.error({ ...logContext, durationMs, err: { message: err.message } }, 'Email job failed');
    throw err;
  }
}

async function processWelcome(job) {
  const { to, name } = job.data;
  await emailService.sendWelcomeEmail({ name, email: to });
  return { sent: true, emailType: 'email.welcome', to };
}

async function processVerification(job) {
  const { to, name, verifyUrl } = job.data;
  await emailService.sendVerificationEmail({ name, email: to }, verifyUrl);
  return { sent: true, emailType: 'email.verification', to };
}

async function processPasswordReset(job) {
  const { to, name, resetUrl } = job.data;
  await emailService.sendPasswordResetEmail({ name, email: to }, resetUrl);
  return { sent: true, emailType: 'email.password-reset', to };
}

async function processUnlockAccount(job) {
  const { to, name, unlockUrl } = job.data;
  await emailService.sendUnlockAccountEmail({ name, email: to }, unlockUrl);
  return { sent: true, emailType: 'email.unlock-account', to };
}

async function processOrderConfirmation(job) {
  const { to, name, order } = job.data;
  await emailService.sendOrderConfirmationEmail({ name, email: to }, order);
  return { sent: true, emailType: 'email.order-confirmation', to };
}

module.exports = { processJob };
