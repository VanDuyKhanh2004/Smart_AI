const User = require('../models/User');
const fs = require('fs');
const path = require('path');

/**
 * @desc    Get current user profile
 * @route   GET /api/profile
 * @access  Private
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    res.status(200).json({
      success: true,
      data: user.toJSON()
    });
  } catch (error) {
    console.error('GetProfile error:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

/**
 * @desc    Update profile information (name, phone)
 * @route   PUT /api/profile
 * @access  Private
 */
const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updateData = {};

    // Validate and add name if provided
    if (name !== undefined) {
      if (name.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Tên phải có ít nhất 2 ký tự'
        });
      }
      updateData.name = name.trim();
    }

    // Validate and add phone if provided
    if (phone !== undefined) {
      if (phone && !/^[0-9]{10,11}$/.test(phone)) {
        return res.status(400).json({
          success: false,
          message: 'Số điện thoại phải có 10-11 chữ số'
        });
      }
      updateData.phone = phone || null;
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin thành công',
      data: user.toJSON()
    });
  } catch (error) {
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0]
      });
    }

    console.error('UpdateProfile error:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

/**
 * @desc    Upload avatar
 * @route   POST /api/profile/avatar
 * @access  Private
 */
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn file ảnh'
      });
    }

    const user = await User.findById(req.user._id);
    
    if (!user) {
      // Delete uploaded file if user not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    // Delete old avatar if exists
    if (user.avatar) {
      const oldAvatarPath = path.join(__dirname, '..', user.avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    // Update user with new avatar path
    const avatarPath = `uploads/avatars/${req.file.filename}`;
    user.avatar = avatarPath;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Cập nhật ảnh đại diện thành công',
      data: user.toJSON()
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error('UploadAvatar error:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

/**
 * @desc    Change password
 * @route   PUT /api/profile/password
 * @access  Private
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin'
      });
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự'
      });
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu xác nhận không khớp'
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu hiện tại không đúng'
      });
    }

    // Check if new password is different from current
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Đổi mật khẩu thành công'
    });
  } catch (error) {
    console.error('ChangePassword error:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  changePassword
};
