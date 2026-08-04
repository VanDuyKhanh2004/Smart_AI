jest.mock('../configs/cloudinary', () => ({
  getClient: jest.fn(),
}));

const { uploadProductImageIfNeeded, deleteImageFromCloudinary, validateImageInput, isBase64DataUri, isAbsoluteHttpsUrl } = require('../services/productImageService');
const { getClient } = require('../configs/cloudinary');

function makeJpegBase64(length = 100) {
  const buf = Buffer.alloc(length, 0xff);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function makePngBase64(length = 100) {
  const buf = Buffer.alloc(length, 0x89);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function makeWebpBase64(length = 100) {
  const buf = Buffer.alloc(length, 0x52);
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

/* ============================================================
   isBase64DataUri
============================================================ */
describe('isBase64DataUri', () => {
  it('returns true for valid JPEG data URI', () => {
    expect(isBase64DataUri('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });
  it('returns true for PNG data URI', () => {
    expect(isBase64DataUri('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });
  it('returns true for WebP data URI', () => {
    expect(isBase64DataUri('data:image/webp;base64,UklGR')).toBe(true);
  });
  it('returns false for plain URL', () => {
    expect(isBase64DataUri('https://example.com/img.jpg')).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(isBase64DataUri('')).toBe(false);
  });
  it('returns false for non-image data URI', () => {
    expect(isBase64DataUri('data:text/plain;base64,SGVsbG8=')).toBe(false);
  });
});

/* ============================================================
   isAbsoluteHttpsUrl
============================================================ */
describe('isAbsoluteHttpsUrl', () => {
  it('returns true for valid HTTPS URL', () => {
    expect(isAbsoluteHttpsUrl('https://example.com/img.jpg')).toBe(true);
  });
  it('returns false for HTTP URL', () => {
    expect(isAbsoluteHttpsUrl('http://example.com/img.jpg')).toBe(false);
  });
  it('returns false for relative path', () => {
    expect(isAbsoluteHttpsUrl('/uploads/img.jpg')).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(isAbsoluteHttpsUrl('')).toBe(false);
  });
  it('returns false for data URI', () => {
    expect(isAbsoluteHttpsUrl('data:image/jpeg;base64,abc')).toBe(false);
  });
});

/* ============================================================
   validateImageInput
============================================================ */
describe('validateImageInput', () => {
  /* --- skip --- */
  it('skips undefined input', () => {
    expect(validateImageInput(undefined)).toEqual({ valid: true, action: 'skip' });
  });
  it('skips null input', () => {
    expect(validateImageInput(null)).toEqual({ valid: true, action: 'skip' });
  });
  it('skips empty string', () => {
    expect(validateImageInput('')).toEqual({ valid: true, action: 'skip' });
  });
  it('skips whitespace-only string', () => {
    expect(validateImageInput('   ')).toEqual({ valid: true, action: 'skip' });
  });

  /* --- HTTPS --- */
  it('keeps absolute public HTTPS URL', () => {
    const result = validateImageInput('https://cdn.example.com/img.jpg');
    expect(result).toEqual({ valid: true, action: 'keep', value: 'https://cdn.example.com/img.jpg' });
  });
  it('rejects localhost HTTPS URL in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://localhost:5000/img.jpg');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/localhost/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('rejects private IP HTTPS URL in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://192.168.1.1/img.jpg');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private network/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('accepts localhost HTTPS URL in development', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const result = validateImageInput('https://localhost:5000/img.jpg');
      expect(result.valid).toBe(true);
      expect(result.action).toBe('keep');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  /* --- HTTP --- */
  it('rejects HTTP URL', () => {
    const result = validateImageInput('http://example.com/img.jpg');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/HTTP/);
  });

  /* --- relative, schemes --- */
  it('rejects relative URL', () => {
    const result = validateImageInput('/uploads/img.jpg');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/relative/i);
  });
  it('rejects javascript: URL', () => {
    const result = validateImageInput('javascript:alert(1)');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/scheme/i);
  });
  it('rejects blob: URL', () => {
    const result = validateImageInput('blob:https://example.com/uuid');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/scheme/i);
  });
  it('rejects file: URL', () => {
    const result = validateImageInput('file:///etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/scheme/i);
  });

  /* --- valid Base64 --- */
  it('accepts valid JPEG Base64', () => {
    const uri = makeJpegBase64();
    const result = validateImageInput(uri);
    expect(result.valid).toBe(true);
    expect(result.action).toBe('upload');
    expect(result.mime).toBe('image/jpeg');
    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBe(100);
  });
  it('accepts valid PNG Base64', () => {
    const uri = makePngBase64();
    const result = validateImageInput(uri);
    expect(result.valid).toBe(true);
    expect(result.action).toBe('upload');
    expect(result.mime).toBe('image/png');
  });
  it('accepts valid WebP Base64', () => {
    const uri = makeWebpBase64();
    const result = validateImageInput(uri);
    expect(result.valid).toBe(true);
    expect(result.action).toBe('upload');
    expect(result.mime).toBe('image/webp');
  });

  /* --- invalid Base64 --- */
  it('rejects non-image data URI', () => {
    const result = validateImageInput('data:text/plain;base64,SGVsbG8=');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/only image data URIs/i);
  });
  it('rejects malformed Base64 - illegal characters', () => {
    const result = validateImageInput('data:image/jpeg;base64,!!!not-valid-base64!!!');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/malformed/i);
  });
  it('rejects malformed Base64 - incorrect padding', () => {
    const result = validateImageInput('data:image/jpeg;base64,ABC===extra');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/malformed/i);
  });
  it('rejects empty decoded Base64', () => {
    const result = validateImageInput('data:image/jpeg;base64,');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });
  it('rejects GIF data URI', () => {
    const result = validateImageInput('data:image/gif;base64,R0lGODlh');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unsupported image type/i);
  });
  it('rejects SVG data URI', () => {
    const result = validateImageInput('data:image/svg+xml;base64,PHN2Zy8+');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unsupported image type/i);
  });

  /* --- re-encoding detection --- */
  it('rejects Base64 with invalid trailing characters that Buffer.from silently accepts', () => {
    const result = validateImageInput('data:image/jpeg;base64,/9j/4AAQSkZJRg==trash');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/malformed/i);
  });

  /* --- size --- */
  it('rejects oversized image', () => {
    const uri = makeJpegBase64(6 * 1024 * 1024);
    const result = validateImageInput(uri);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });
  it('accepts image exactly at size limit', () => {
    const uri = makeJpegBase64(5 * 1024 * 1024);
    const result = validateImageInput(uri);
    expect(result.valid).toBe(true);
    expect(result.action).toBe('upload');
  });

  /* --- other invalid inputs --- */
  it('rejects non-string input', () => {
    expect(validateImageInput(123).valid).toBe(false);
    expect(validateImageInput({}).valid).toBe(false);
    expect(validateImageInput([]).valid).toBe(false);
  });
  it('rejects plain filename string', () => {
    const result = validateImageInput('photo.jpg');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid image format/i);
  });
});

/* ============================================================
   uploadProductImageIfNeeded
============================================================ */
describe('uploadProductImageIfNeeded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* --- skip / keep --- */
  it('returns empty imageUrl and null imagePublicId for undefined', async () => {
    const result = await uploadProductImageIfNeeded(undefined);
    expect(result).toEqual({ imageUrl: '', imagePublicId: null });
  });
  it('returns empty for null', async () => {
    const result = await uploadProductImageIfNeeded(null);
    expect(result).toEqual({ imageUrl: '', imagePublicId: null });
  });
  it('returns empty for empty string', async () => {
    const result = await uploadProductImageIfNeeded('');
    expect(result).toEqual({ imageUrl: '', imagePublicId: null });
  });
  it('preserves absolute HTTPS URL', async () => {
    const result = await uploadProductImageIfNeeded('https://example.com/img.jpg');
    expect(result).toEqual({ imageUrl: 'https://example.com/img.jpg', imagePublicId: null });
  });

  /* --- validation rejection --- */
  it('rejects HTTP URL', async () => {
    await expect(uploadProductImageIfNeeded('http://example.com/img.jpg')).rejects.toThrow('HTTP');
  });
  it('rejects relative URL', async () => {
    await expect(uploadProductImageIfNeeded('/uploads/img.jpg')).rejects.toThrow(/relative/i);
  });

  /* --- configuration --- */
  it('HTTPS pass-through works without Cloudinary credentials', async () => {
    getClient.mockReturnValue(null);
    const result = await uploadProductImageIfNeeded('https://cdn.example.com/img.jpg');
    expect(result).toEqual({ imageUrl: 'https://cdn.example.com/img.jpg', imagePublicId: null });
  });
  it('empty input works without Cloudinary credentials', async () => {
    getClient.mockReturnValue(null);
    const result = await uploadProductImageIfNeeded('');
    expect(result).toEqual({ imageUrl: '', imagePublicId: null });
  });
  it('throws cleanly when Cloudinary not configured for Base64 upload', async () => {
    getClient.mockReturnValue(null);
    await expect(uploadProductImageIfNeeded(makeJpegBase64())).rejects.toThrow('Cloudinary is not configured');
  });

  /* --- successful upload --- */
  it('uploads Base64 image and returns imageUrl and imagePublicId', async () => {
    const mockUploadStream = jest.fn((_opts, cb) => {
      const { Writable } = require('stream');
      const stream = new Writable({
        write(chunk, _encoding, next) { next(); },
        final(next) {
          cb(null, {
            secure_url: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/abc123.jpg',
            public_id: 'smart-ai/products/abc123',
          });
          next();
        },
      });
      return stream;
    });
    getClient.mockReturnValue({ uploader: { upload_stream: mockUploadStream } });

    const result = await uploadProductImageIfNeeded(makeJpegBase64());
    expect(result).toEqual({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/abc123.jpg',
      imagePublicId: 'smart-ai/products/abc123',
    });
    expect(mockUploadStream).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'smart-ai/products', resource_type: 'image' }),
      expect.any(Function),
    );
  });

  /* --- upload error --- */
  it('wraps Cloudinary provider error without exposing raw details', async () => {
    const mockUploadStream = jest.fn((_opts, cb) => {
      const { Writable } = require('stream');
      const stream = new Writable({
        write(chunk, _encoding, next) { next(); },
        final(next) {
          cb(new Error('socket hang up'), null);
          next();
        },
      });
      return stream;
    });
    getClient.mockReturnValue({ uploader: { upload_stream: mockUploadStream } });

    await expect(uploadProductImageIfNeeded(makeJpegBase64())).rejects.toThrow('Cloudinary upload failed');
  });

  /* --- malformed Base64 at upload level (validation catches first) --- */
  it('rejects malformed Base64 in upload path', async () => {
    getClient.mockReturnValue({ uploader: { upload_stream: jest.fn() } });
    await expect(uploadProductImageIfNeeded('data:image/jpeg;base64,!!!invalid!!!')).rejects.toThrow(/malformed/i);
  });
});

/* ============================================================
   deleteImageFromCloudinary
============================================================ */
describe('deleteImageFromCloudinary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns skipped no-op when publicId is null', async () => {
    const result = await deleteImageFromCloudinary(null);
    expect(result).toEqual({ deleted: true, publicId: null, result: 'skipped' });
  });

  it('returns skipped no-op when publicId is undefined', async () => {
    const result = await deleteImageFromCloudinary(undefined);
    expect(result).toEqual({ deleted: true, publicId: null, result: 'skipped' });
  });

  it('returns skipped no-op when publicId is empty string', async () => {
    const result = await deleteImageFromCloudinary('');
    expect(result).toEqual({ deleted: true, publicId: null, result: 'skipped' });
  });

  it('does not call Cloudinary destroy for empty publicId', async () => {
    const destroy = jest.fn();
    getClient.mockReturnValue({ uploader: { destroy } });
    await deleteImageFromCloudinary('');
    expect(destroy).not.toHaveBeenCalled();
  });

  it('returns deleted when Cloudinary reports result ok', async () => {
    const destroy = jest.fn().mockResolvedValue({ result: 'ok' });
    getClient.mockReturnValue({ uploader: { destroy } });

    const result = await deleteImageFromCloudinary('smart-ai/products/abc');
    expect(destroy).toHaveBeenCalledWith('smart-ai/products/abc');
    expect(result).toEqual({ deleted: true, publicId: 'smart-ai/products/abc', result: 'deleted' });
  });

  it('returns idempotent success when Cloudinary reports not found', async () => {
    const destroy = jest.fn().mockResolvedValue({ result: 'not found' });
    getClient.mockReturnValue({ uploader: { destroy } });

    const result = await deleteImageFromCloudinary('smart-ai/products/abc');
    expect(result).toEqual({ deleted: true, publicId: 'smart-ai/products/abc', result: 'not_found' });
  });

  it('returns controlled failure for unexpected resolved result', async () => {
    const destroy = jest.fn().mockResolvedValue({ result: 'weird' });
    getClient.mockReturnValue({ uploader: { destroy } });

    const result = await deleteImageFromCloudinary('smart-ai/products/abc');
    expect(result.deleted).toBe(false);
    expect(result.publicId).toBe('smart-ai/products/abc');
    expect(result.result).toBe('failed');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('returns controlled failure when destroy rejects', async () => {
    const destroy = jest.fn().mockRejectedValue(new Error('socket hang up'));
    getClient.mockReturnValue({ uploader: { destroy } });

    const result = await deleteImageFromCloudinary('smart-ai/products/abc');
    expect(result.deleted).toBe(false);
    expect(result.publicId).toBe('smart-ai/products/abc');
    expect(result.result).toBe('failed');
    expect(result.error.message).toBe('socket hang up');
  });

  it('returns controlled failure when Cloudinary is not configured', async () => {
    getClient.mockReturnValue(null);

    const result = await deleteImageFromCloudinary('smart-ai/products/abc');
    expect(result.deleted).toBe(false);
    expect(result.publicId).toBe('smart-ai/products/abc');
    expect(result.result).toBe('failed');
    expect(result.error).toBeInstanceOf(Error);
  });
});

/* ============================================================
   Security / logging
============================================================ */
describe('security and logging', () => {
  it('no logs contain Base64 payload', () => {
    const spyWarn = jest.spyOn(console, 'warn');
    const spyError = jest.spyOn(console, 'error');
    const uri = makeJpegBase64();
    validateImageInput(uri);
    expect(spyWarn).not.toHaveBeenCalled();
    expect(spyError).not.toHaveBeenCalled();
    spyWarn.mockRestore();
    spyError.mockRestore();
  });

  it('no logs contain Cloudinary secrets', () => {
    const prevName = process.env.CLOUDINARY_CLOUD_NAME;
    const prevKey = process.env.CLOUDINARY_API_KEY;
    const prevSecret = process.env.CLOUDINARY_API_SECRET;
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';

    const { getClient: freshGet } = require('../configs/cloudinary');
    const spyWarn = jest.spyOn(console, 'warn');
    const spyError = jest.spyOn(console, 'error');

    const client = freshGet();
    expect(client).toBeDefined();

    expect(spyWarn).not.toHaveBeenCalled();
    expect(spyError).not.toHaveBeenCalled();

    spyWarn.mockRestore();
    spyError.mockRestore();
    if (prevName) process.env.CLOUDINARY_CLOUD_NAME = prevName; else delete process.env.CLOUDINARY_CLOUD_NAME;
    if (prevKey) process.env.CLOUDINARY_API_KEY = prevKey; else delete process.env.CLOUDINARY_API_KEY;
    if (prevSecret) process.env.CLOUDINARY_API_SECRET = prevSecret; else delete process.env.CLOUDINARY_API_SECRET;
  });
});

/* ============================================================
   Migration helpers
============================================================ */
describe('migration logic', () => {
  it('uploadProductImageIfNeeded correctly identifies Base64 for migration', async () => {
    const uri = makeJpegBase64();
    expect(isBase64DataUri(uri)).toBe(true);
    expect(isAbsoluteHttpsUrl(uri)).toBe(false);
  });
  it('skips already migrated HTTPS records', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/abc.jpg';
    expect(isBase64DataUri(url)).toBe(false);
    expect(isAbsoluteHttpsUrl(url)).toBe(true);
  });
  it('handles empty image as already migrated', () => {
    expect(isBase64DataUri('')).toBe(false);
    expect(isAbsoluteHttpsUrl('')).toBe(false);
  });
});

describe('validation - production HTTPS restrictions', () => {
  it('rejects localhost HTTPS in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://localhost:5000/img.jpg');
      expect(result.valid).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('rejects 127.0.0.1 HTTPS in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://127.0.0.1/img.jpg');
      expect(result.valid).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('rejects 10.x.x.x HTTPS in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://10.0.0.5/img.jpg');
      expect(result.valid).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('accepts public HTTPS in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://cdn.example.com/img.jpg');
      expect(result.valid).toBe(true);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('rejects 172.16.x.x private range in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://172.16.0.1/img.jpg');
      expect(result.valid).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('rejects 172.31.x.x private range in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://172.31.255.255/img.jpg');
      expect(result.valid).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('accepts 172.32.x.x public range in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://172.32.0.1/img.jpg');
      expect(result.valid).toBe(true);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('accepts 172.200.x.x public range in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateImageInput('https://172.200.0.1/img.jpg');
      expect(result.valid).toBe(true);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
