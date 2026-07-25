const { getClient } = require('../configs/cloudinary');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DECODED_SIZE_BYTES = 5 * 1024 * 1024;

const DATA_URI_REGEX = /^data:(image\/([a-zA-Z0-9+]+));base64,(.*)$/;
const BASE64_STRICT = /^[A-Za-z0-9+/]*={0,2}$/;

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

  const client = getClient();
  if (!client) {
    throw new Error('Cloudinary is not configured');
  }

  const result = await new Promise((resolve, reject) => {
    const uploadStream = client.uploader.upload_stream(
      {
        folder: 'smart-ai/products',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      },
      (error, result) => {
        if (error) {
          reject(new Error('Cloudinary upload failed'));
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(validation.buffer);
  });

  return { imageUrl: result.secure_url, imagePublicId: result.public_id };
}

module.exports = { uploadProductImageIfNeeded, validateImageInput, isBase64DataUri, isAbsoluteHttpsUrl, ProductImageValidationError };
