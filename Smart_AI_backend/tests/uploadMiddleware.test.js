const express = require('express');
const request = require('supertest');
const multer = require('multer');

const {
  uploadAvatar,
  uploadProductImage,
  createImageUpload,
} = require('../middlewares/uploadMiddleware');

function buildApp(middleware) {
  const app = express();
  app.use((req, res, next) => {
    req.user = { _id: '507f191e810c19729de860ea' };
    next();
  });
  app.post('/upload', middleware, (req, res) => {
    res.status(200).json({
      success: true,
      file: req.file
        ? {
            fieldname: req.file.fieldname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            buffer: req.file.buffer ? 'present' : 'absent',
          }
        : null,
    });
  });
  return app;
}

function makeBufferWithMagic(mimetype, length = 100) {
  const buf = Buffer.alloc(length, 0x00);
  if (mimetype === 'image/jpeg') {
    buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  } else if (mimetype === 'image/png') {
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  } else if (mimetype === 'image/webp') {
    buf.write('RIFF', 0, 'ascii');
    buf.write('WEBP', 8, 'ascii');
  }
  return buf;
}

describe('uploadProductImage (memory storage)', () => {
  const app = buildApp(uploadProductImage);

  it('accepts a valid JPEG and exposes buffer via memory storage', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('image', makeBufferWithMagic('image/jpeg'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.file.mimetype).toBe('image/jpeg');
    expect(res.body.file.buffer).toBe('present');
  });

  it('accepts a valid PNG', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('image', makeBufferWithMagic('image/png'), {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(200);

    expect(res.body.file.mimetype).toBe('image/png');
    expect(res.body.file.buffer).toBe('present');
  });

  it('accepts a valid WebP', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('image', makeBufferWithMagic('image/webp'), {
        filename: 'photo.webp',
        contentType: 'image/webp',
      })
      .expect(200);

    expect(res.body.file.mimetype).toBe('image/webp');
    expect(res.body.file.buffer).toBe('present');
  });

  it('rejects unsupported MIME (image/gif) with stable error shape', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('image', makeBufferWithMagic('image/jpeg'), {
        filename: 'photo.gif',
        contentType: 'image/gif',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_IMAGE_FILE');
  });

  it('rejects oversized file (>5MB) with stable error shape', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;

    const res = await request(app)
      .post('/upload')
      .attach('image', big, {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('IMAGE_FILE_TOO_LARGE');
  });

  it('accepts a file just under the 5MB limit', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 - 1024, 0xff);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;

    const res = await request(app)
      .post('/upload')
      .attach('image', big, {
        filename: 'atlimit.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    expect(res.body.file.size).toBe(5 * 1024 * 1024 - 1024);
  });

  it('treats a request with no file but valid multipart body as success (no file)', async () => {
    const res = await request(app)
      .post('/upload')
      .field('name', 'Test Product')
      .field('price', '100')
      .expect(200);

    expect(res.body.file).toBeNull();
  });
});

describe('uploadAvatar regression (disk storage, 2MB)', () => {
  const app = buildApp(uploadAvatar);

  it('accepts a valid JPEG avatar', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('avatar', makeBufferWithMagic('image/jpeg'), {
        filename: 'avatar.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.file.fieldname).toBe('avatar');
  });

  it('rejects unsupported MIME with the existing error contract', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('avatar', makeBufferWithMagic('image/jpeg'), {
        filename: 'avatar.gif',
        contentType: 'image/gif',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
  });

  it('rejects oversized avatar (>2MB) with the existing message', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 0xff);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;

    const res = await request(app)
      .post('/upload')
      .attach('avatar', big, {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('2MB');
  });
});

describe('createImageUpload factory', () => {
  it('produces a callable middleware bound to the given field/size', async () => {
    const custom = createImageUpload({
      storage: multer.memoryStorage(),
      fieldName: 'document',
      maxSizeBytes: 1024,
    });
    const app = buildApp(custom);

    const res = await request(app)
      .post('/upload')
      .attach('document', Buffer.alloc(10, 0xff), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    expect(res.body.file.fieldname).toBe('document');
    expect(res.body.file.mimetype).toBe('image/jpeg');
    expect(res.body.file.buffer).toBe('present');
  });
});