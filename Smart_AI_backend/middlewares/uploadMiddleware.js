const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = 'uploads/avatars';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Configure disk storage (avatar)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${req.user._id}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, webp)'), false);
  }
};

// ---------------------------------------------------------------------------
// Reusable image-upload factory.
//
// storage  : multer storage engine (diskStorage, memoryStorage, ...)
// fieldName: single file field to accept
// maxSizeBytes: per-file size limit
//
// Errors bypass the centralized error middleware and are emitted directly with
// a stable code so clients can branch on the failure type. Raw Multer/internal
// messages are never exposed verbatim.
// ---------------------------------------------------------------------------
function createImageUpload({ storage, fieldName, maxSizeBytes }) {
  const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: maxSizeBytes },
  });

  const handler = upload.single(fieldName);

  return (req, res, next) => {
    handler(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'Kích thước file không được vượt quá giới hạn',
            code: 'IMAGE_FILE_TOO_LARGE',
          });
        }
        return res.status(400).json({
          success: false,
          message: 'File không hợp lệ. Chỉ chấp nhận ảnh (jpg, png, webp)',
          code: 'INVALID_IMAGE_FILE',
        });
      }
      next();
    });
  };
}

// Avatar middleware (preserves previous behavior verbatim, disk storage, 2MB).
const uploadAvatar = (req, res, next) => {
  const upload = multer({
    storage: avatarStorage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
  });

  const uploadAvatarFile = upload.single('avatar');

  uploadAvatarFile(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Kích thước file không được vượt quá 2MB'
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  });
};

// Product image middleware (memory storage, single "image" field, 5MB).
const uploadProductImage = createImageUpload({
  storage: multer.memoryStorage(),
  fieldName: 'image',
  maxSizeBytes: 5 * 1024 * 1024,
});

// Backward-compatible default export: the avatar middleware is still callable.
uploadAvatar.createImageUpload = createImageUpload;
uploadAvatar.uploadAvatar = uploadAvatar;
uploadAvatar.uploadProductImage = uploadProductImage;

module.exports = uploadAvatar;