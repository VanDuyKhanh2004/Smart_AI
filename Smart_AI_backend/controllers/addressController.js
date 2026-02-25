const Address = require('../models/Address');

const MAX_ADDRESSES = 5;

// Get all addresses for current user
// Requirements: 1.2
const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user._id })
      .sort({ isDefault: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: addresses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create new address
// Requirements: 1.2, 1.3
const createAddress = async (req, res) => {
  try {
    const { label, fullName, phone, address, ward, district, city } = req.body;

    // Check max addresses limit
    const addressCount = await Address.countDocuments({ user: req.user._id });
    if (addressCount >= MAX_ADDRESSES) {
      return res.status(400).json({
        success: false,
        message: 'Bạn chỉ có thể lưu tối đa 5 địa chỉ'
      });
    }

    // If this is the first address, set as default (Requirement 1.5)
    const isDefault = addressCount === 0;

    const newAddress = await Address.create({
      user: req.user._id,
      label,
      fullName,
      phone,
      address,
      ward,
      district,
      city,
      isDefault
    });

    res.status(201).json({
      success: true,
      message: 'Đã thêm địa chỉ mới',
      data: newAddress
    });
  } catch (error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0]
      });
    }

    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// Update existing address
// Requirements: 3.2, 3.3
const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, fullName, phone, address, ward, district, city } = req.body;

    // Find address and verify ownership
    const existingAddress = await Address.findById(id);
    if (!existingAddress) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa chỉ'
      });
    }

    if (existingAddress.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập địa chỉ này'
      });
    }

    // Update fields but preserve isDefault status (Requirement 3.3)
    existingAddress.label = label;
    existingAddress.fullName = fullName;
    existingAddress.phone = phone;
    existingAddress.address = address;
    existingAddress.ward = ward;
    existingAddress.district = district;
    existingAddress.city = city;

    await existingAddress.save();

    res.status(200).json({
      success: true,
      message: 'Đã cập nhật địa chỉ',
      data: existingAddress
    });
  } catch (error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0]
      });
    }

    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete address
// Requirements: 4.2, 4.3
const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // Find address and verify ownership
    const addressToDelete = await Address.findById(id);
    if (!addressToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa chỉ'
      });
    }

    if (addressToDelete.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập địa chỉ này'
      });
    }

    const wasDefault = addressToDelete.isDefault;

    // Delete the address
    await Address.findByIdAndDelete(id);

    // If deleted address was default and other addresses exist, set new default (Requirement 4.3)
    if (wasDefault) {
      const remainingAddress = await Address.findOne({ user: req.user._id })
        .sort({ createdAt: -1 });
      
      if (remainingAddress) {
        remainingAddress.isDefault = true;
        await remainingAddress.save();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Đã xóa địa chỉ'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Set address as default
// Requirements: 5.1
const setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // Find address and verify ownership
    const addressToSetDefault = await Address.findById(id);
    if (!addressToSetDefault) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa chỉ'
      });
    }

    if (addressToSetDefault.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập địa chỉ này'
      });
    }

    // Remove default from all user's addresses
    await Address.updateMany(
      { user: req.user._id },
      { isDefault: false }
    );

    // Set new default
    addressToSetDefault.isDefault = true;
    await addressToSetDefault.save();

    res.status(200).json({
      success: true,
      message: 'Đã đặt làm địa chỉ mặc định',
      data: addressToSetDefault
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi, vui lòng thử lại',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
};
