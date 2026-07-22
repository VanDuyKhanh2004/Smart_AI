const crypto = require('crypto');
const mongoose = require('mongoose');

const idempotencyRecordSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
  },
  idempotencyKey: {
    type: String,
    required: [true, 'Idempotency key is required'],
    trim: true,
  },
  requestFingerprint: {
    type: String,
    required: [true, 'Request fingerprint is required'],
    trim: true,
  },
  checkoutFingerprint: {
    type: String,
    default: null,
    trim: true,
  },
  status: {
    type: String,
    enum: {
      values: ['processing', 'completed', 'failed'],
      message: 'Status must be processing, completed, or failed',
    },
    required: [true, 'Status is required'],
    default: 'processing',
  },
  attemptId: {
    type: String,
    default: null,
    trim: true,
  },
  processingExpiresAt: {
    type: Date,
    default: null,
  },
  errorCode: {
    type: String,
    default: null,
    trim: true,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  responseStatus: {
    type: Number,
    default: null,
  },
  responseOrderNumber: {
    type: String,
    default: null,
    trim: true,
  },
  errorMessage: {
    type: String,
    default: null,
    trim: true,
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry is required'],
  },
}, {
  timestamps: true,
});

idempotencyRecordSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
idempotencyRecordSchema.index({ status: 1, processingExpiresAt: 1 });

idempotencyRecordSchema.static('ttlMs', function ttlMs() {
  const hours = parseInt(process.env.CHECKOUT_IDEMPOTENCY_TTL_HOURS, 10) || 168;
  return hours * 60 * 60 * 1000;
});

idempotencyRecordSchema.static('processingTimeoutMs', function processingTimeoutMs() {
  return parseInt(process.env.CHECKOUT_IDEMPOTENCY_PROCESSING_TIMEOUT_MS, 10) || 30000;
});

module.exports = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);
