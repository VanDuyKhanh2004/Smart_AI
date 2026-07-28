const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

function safeUnlink(filePath, context = '') {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logger.warn({ err, path: filePath, context }, 'File cleanup failed');
  }
}

const getProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new NotFoundError('Không tìm thấy người dùng', 'USER_NOT_FOUND', 'legacy-top-level-message');
  }

  res.status(200).json({
    success: true,
    data: user.toJSON()
  });
};

const updateProfile = async (req, res) => {
  const { name, phone } = req.body;
  const updateData = {};

  if (name !== undefined) {
    if (name.length < 2) {
      throw new BadRequestError('Tên phải có ít nhất 2 ký tự', 'INVALID_NAME', undefined, 'legacy-top-level-message');
    }
    updateData.name = name.trim();
  }

  if (phone !== undefined) {
    if (phone && !/^[0-9]{10,11}$/.test(phone)) {
      throw new BadRequestError('Số điện thoại phải có 10-11 chữ số', 'INVALID_PHONE', undefined, 'legacy-top-level-message');
    }
    updateData.phone = phone || null;
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  );

  if (!user) {
    throw new NotFoundError('Không tìm thấy người dùng', 'USER_NOT_FOUND', 'legacy-top-level-message');
  }

  res.status(200).json({
    success: true,
    message: 'Cập nhật thông tin thành công',
    data: user.toJSON()
  });
};

const uploadAvatar = async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('Vui lòng chọn file ảnh', 'NO_FILE', undefined, 'legacy-top-level-message');
  }

  const uploadedFilePath = req.file.path;

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new NotFoundError('Không tìm thấy người dùng', 'USER_NOT_FOUND', 'legacy-top-level-message');
    }

    if (user.avatar) {
      safeUnlink(path.join(__dirname, '..', user.avatar), 'old-avatar');
    }

    const avatarPath = `uploads/avatars/${req.file.filename}`;
    user.avatar = avatarPath;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Cập nhật ảnh đại diện thành công',
      data: user.toJSON()
    });
  } catch (error) {
    safeUnlink(uploadedFilePath, 'uploaded-avatar');
    throw error;
  }
};

const changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new BadRequestError('Vui lòng điền đầy đủ thông tin', 'MISSING_FIELDS', undefined, 'legacy-top-level-message');
  }

  if (newPassword.length < 6) {
    throw new BadRequestError('Mật khẩu mới phải có ít nhất 6 ký tự', 'WEAK_PASSWORD', undefined, 'legacy-top-level-message');
  }

  if (newPassword !== confirmPassword) {
    throw new BadRequestError('Mật khẩu xác nhận không khớp', 'PASSWORD_MISMATCH', undefined, 'legacy-top-level-message');
  }

  const user = await User.findById(req.user._id).select('+password');

  if (!user) {
    throw new NotFoundError('Không tìm thấy người dùng', 'USER_NOT_FOUND', 'legacy-top-level-message');
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new BadRequestError('Mật khẩu hiện tại không đúng', 'WRONG_PASSWORD', undefined, 'legacy-top-level-message');
  }

  const isSamePassword = await user.comparePassword(newPassword);
  if (isSamePassword) {
    throw new BadRequestError('Mật khẩu mới phải khác mật khẩu hiện tại', 'SAME_PASSWORD', undefined, 'legacy-top-level-message');
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Đổi mật khẩu thành công'
  });
};

module.exports = {
  getProfile: asyncHandler(getProfile),
  updateProfile: asyncHandler(updateProfile),
  uploadAvatar: asyncHandler(uploadAvatar),
  changePassword: asyncHandler(changePassword)
};
