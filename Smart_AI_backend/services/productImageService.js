const { getClient } = require('../configs/cloudinary');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DECODED_SIZE_BYTES = 5 * 1024 * 1024;

const DATA_URI_REGEX = /^data:(image\/([a-zA-Z0-9+]+));base64,(.*)$/;
const BASE64_STRICT = /^[A-Za-z0-9+/]*={0,2}$/;

const UPLOAD_OPTIONS = {
  folder: 'smart-ai/products',
  resource_type: 'image',
  allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
};

const MAGIC_BYTES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': null, // RIFF....WEBP, checked by string comparison below
};

const WEBP_RIFF = 'RIFF';
const WEBP_MARKER = 'WEBP';

class ProductImageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProductImageValidationError';
    this.statusCode = 400;
    this.code = 'INVALID_PRODUCT_IMAGE';
  }
}

function isBase64DataUri(value) {
  return typeof value === 'string' && DATA_URI_REGEX.test(value);
}

function isAbsoluteHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalOrPrivateHostname(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '[::1]') return true;
  const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;
  const octets = ipv4Match.slice(1).map(Number);
  if (octets.some(o => o < 0 || o > 255)) return false;
  if (octets[0] === 127) return true;
  if (octets[0] === 10) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  return false;
}

function parseDataUri(dataUri) {
  const match = dataUri.match(DATA_URI_REGEX);
  if (!match) return null;
  return { mime: match[1], extension: match[2], base64: match[3] };
}

function validateImageInput(image) {
  if (image === undefined || image === null || image === '') {
    return { valid: true, action: 'skip' };
  }

  if (typeof image !== 'string') {
    return { valid: false, error: 'Image must be a string' };
  }

  const trimmed = image.trim();

  if (!trimmed) {
    return { valid: true, action: 'skip' };
  }

  if (trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const env = process.env.NODE_ENV || 'development';
      if (env === 'production' && isLocalOrPrivateHostname(parsed.hostname)) {
        return { valid: false, error: 'Localhost and private network image URLs are not allowed in production' };
      }
      return { valid: true, action: 'keep', value: trimmed };
    } catch {
      return { valid: false, error: 'Invalid HTTPS URL' };
    }
  }

  if (trimmed.startsWith('http://')) {
    return { valid: false, error: 'HTTP image URLs are not allowed. Use HTTPS or a data URI.' };
  }

  if (trimmed.startsWith('data:')) {
    const parsed = parseDataUri(trimmed);
    if (!parsed) {
      if (!trimmed.includes('image/')) {
        return { valid: false, error: 'Only image data URIs are supported (image/jpeg, image/png, image/webp)' };
      }
      return { valid: false, error: 'Invalid data URI format' };
    }

    const fullMime = `image/${parsed.extension.toLowerCase()}`;
    if (!ALLOWED_MIME_TYPES.includes(fullMime)) {
      return { valid: false, error: 'Unsupported image type. Allowed: image/jpeg, image/png, image/webp' };
    }

    if (parsed.base64.length === 0) {
      return { valid: false, error: 'Decoded image is empty' };
    }

    if (!BASE64_STRICT.test(parsed.base64)) {
      return { valid: false, error: 'Malformed Base64 content' };
    }

    let decoded;
    try {
      decoded = Buffer.from(parsed.base64, 'base64');
    } catch {
      return { valid: false, error: 'Malformed Base64 content' };
    }

    if (decoded.length === 0) {
      return { valid: false, error: 'Decoded image is empty' };
    }

    const reEncoded = decoded.toString('base64');
    const normalizedOriginal = parsed.base64.replace(/=+$/, '');
    const normalizedReEncoded = reEncoded.replace(/=+$/, '');
    if (normalizedOriginal !== normalizedReEncoded) {
      return { valid: false, error: 'Malformed Base64 content' };
    }

    if (decoded.length > MAX_DECODED_SIZE_BYTES) {
      const mb = MAX_DECODED_SIZE_BYTES / (1024 * 1024);
      return { valid: false, error: `Image too large. Maximum ${mb} MB after decoding.` };
    }

    return { valid: true, action: 'upload', mime: fullMime, buffer: decoded };
  }

  if (trimmed.startsWith('/')) {
    return { valid: false, error: 'Relative image paths are not supported. Use an absolute HTTPS URL.' };
  }

  if (trimmed.startsWith('javascript:') || trimmed.startsWith('blob:') || trimmed.startsWith('file:')) {
    return { valid: false, error: 'Unsupported image URL scheme' };
  }

  return { valid: false, error: 'Invalid image format. Provide an HTTPS URL or a valid data URI.' };
}

function getClientOrThrow() {
  const client = getClient();
  if (!client) {
    throw new Error('Cloudinary is not configured');
  }
  return client;
}

function uploadStreamToCloudinary(buffer) {
  const client = getClientOrThrow();
  return new Promise((resolve, reject) => {
    const uploadStream = client.uploader.upload_stream(
      UPLOAD_OPTIONS,
      (error, result) => {
        if (error) {
          reject(new Error('Cloudinary upload failed'));
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * Verify that a buffer's leading bytes match the magic signature of the
 * declared MIME type. Rejects spoofed MIME types (e.g. a PNG disguised as
 * image/jpeg).
 *
 * @param {Buffer} buffer
 * @param {string} mimetype declared Content-Type of the upload
 * @returns {boolean}
 */
function matchesMagicBytes(buffer, mimetype) {
  if (mimetype === 'image/webp') {
    // RIFF (4) .... (4) WEBP (4)
    if (buffer.length < 12) return false;
    return (
      buffer.toString('ascii', 0, 4) === WEBP_RIFF &&
      buffer.toString('ascii', 8, 12) === WEBP_MARKER
    );
  }

  const signature = MAGIC_BYTES[mimetype];
  if (!signature || buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

/**
 * Upload a raw image buffer (e.g. from multer memory storage) to Cloudinary.
 *
 * Validates:
 *  - buffer present and non-empty
 *  - MIME is JPEG/PNG/WebP
 *  - magic bytes match the declared MIME (rejects spoofed MIME types)
 *  - size <= 5 MB
 *
 * @param {Buffer} buffer raw image bytes
 * @param {string} mimetype declared image MIME type
 * @returns {Promise<{imageUrl: string|null, imagePublicId: string|null}>}
 */
async function uploadProductImageBuffer(buffer, mimetype) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ProductImageValidationError('Image file is empty');
  }

  const mime = (mimetype || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mime)) {
    throw new ProductImageValidationError('Unsupported image type. Allowed: image/jpeg, image/png, image/webp');
  }

  if (buffer.length > MAX_DECODED_SIZE_BYTES) {
    const mb = MAX_DECODED_SIZE_BYTES / (1024 * 1024);
    throw new ProductImageValidationError(`Image too large. Maximum ${mb} MB after decoding.`);
  }

  if (!matchesMagicBytes(buffer, mime)) {
    throw new ProductImageValidationError('Image content does not match its declared type');
  }

  const result = await uploadStreamToCloudinary(buffer);
  return { imageUrl: result.secure_url, imagePublicId: result.public_id };
}

async function uploadProductImageIfNeeded(image) {
  const validation = validateImageInput(image);

  if (!validation.valid) {
    throw new ProductImageValidationError(validation.error);
  }

  if (validation.action === 'skip') {
    return { imageUrl: image !== undefined && image !== null ? image : '', imagePublicId: null };
  }

  if (validation.action === 'keep') {
    return { imageUrl: validation.value, imagePublicId: null };
  }

  const result = await uploadStreamToCloudinary(validation.buffer);

  return { imageUrl: result.secure_url, imagePublicId: result.public_id };
}

/**
 * Best-effort Cloudinary asset deletion for product images.
 * Never throws. Returns a stable status object so callers can decide
 * whether to log a warning without masking their original error.
 *
 * @param {string|null|undefined} publicId Cloudinary public id to destroy.
 * @returns {Promise<{deleted: boolean, publicId: string|null, result: 'deleted'|'not_found'|'skipped'|'failed', error?: Error}>}
 */
async function deleteImageFromCloudinary(publicId) {
  if (typeof publicId !== 'string' || publicId.length === 0) {
    return { deleted: true, publicId: null, result: 'skipped' };
  }

  const client = getClient();
  if (!client) {
    return { deleted: false, publicId, result: 'failed', error: new Error('Cloudinary is not configured') };
  }

  let response;
  try {
    response = await client.uploader.destroy(publicId);
  } catch (error) {
    return { deleted: false, publicId, result: 'failed', error };
  }

  if (response && response.result === 'ok') {
    return { deleted: true, publicId, result: 'deleted' };
  }

  if (response && response.result === 'not found') {
    return { deleted: true, publicId, result: 'not_found' };
  }

  return { deleted: false, publicId, result: 'failed', error: new Error('Cloudinary destroy returned an unexpected result') };
}

module.exports = {
  uploadProductImageIfNeeded,
  uploadProductImageBuffer,
  validateImageInput,
  isBase64DataUri,
  isAbsoluteHttpsUrl,
  deleteImageFromCloudinary,
  ProductImageValidationError,
};
