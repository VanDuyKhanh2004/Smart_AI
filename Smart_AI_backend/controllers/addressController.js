const Address = require('../models/Address');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

const MAX_ADDRESSES = 5;

const getAddresses = async (req, res) => {
  const addresses = await Address.find({ user: req.user._id })
    .sort({ isDefault: -1, createdAt: -1 });

  res.status(200).json({
    success: true,
    data: addresses
  });
};

const createAddress = async (req, res) => {
  const { label, fullName, phone, address, ward, district, city } = req.body;

  const addressCount = await Address.countDocuments({ user: req.user._id });
  if (addressCount >= MAX_ADDRESSES) {
    throw new BadRequestError('Bạn chỉ có thể lưu tối đa 5 địa chỉ', 'MAX_ADDRESSES', undefined, 'legacy-top-level-message');
  }

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
};

const updateAddress = async (req, res) => {
  const { id } = req.params;
  const { label, fullName, phone, address, ward, district, city } = req.body;

  const existingAddress = await Address.findById(id);
  if (!existingAddress) {
    throw new NotFoundError('Không tìm thấy địa chỉ', 'ADDRESS_NOT_FOUND', 'legacy-top-level-message');
  }

  if (existingAddress.user.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('Bạn không có quyền truy cập địa chỉ này', 'ADDRESS_ACCESS_DENIED', 'legacy-top-level-message');
  }

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
};

const deleteAddress = async (req, res) => {
  const { id } = req.params;

  const addressToDelete = await Address.findById(id);
  if (!addressToDelete) {
    throw new NotFoundError('Không tìm thấy địa chỉ', 'ADDRESS_NOT_FOUND', 'legacy-top-level-message');
  }

  if (addressToDelete.user.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('Bạn không có quyền truy cập địa chỉ này', 'ADDRESS_ACCESS_DENIED', 'legacy-top-level-message');
  }

  const wasDefault = addressToDelete.isDefault;

  await Address.findByIdAndDelete(id);

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
};

const setDefaultAddress = async (req, res) => {
  const { id } = req.params;

  const addressToSetDefault = await Address.findById(id);
  if (!addressToSetDefault) {
    throw new NotFoundError('Không tìm thấy địa chỉ', 'ADDRESS_NOT_FOUND', 'legacy-top-level-message');
  }

  if (addressToSetDefault.user.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('Bạn không có quyền truy cập địa chỉ này', 'ADDRESS_ACCESS_DENIED', 'legacy-top-level-message');
  }

  await Address.updateMany(
    { user: req.user._id },
    { isDefault: false }
  );

  addressToSetDefault.isDefault = true;
  await addressToSetDefault.save();

  res.status(200).json({
    success: true,
    message: 'Đã đặt làm địa chỉ mặc định',
    data: addressToSetDefault
  });
};

module.exports = {
  getAddresses: asyncHandler(getAddresses),
  createAddress: asyncHandler(createAddress),
  updateAddress: asyncHandler(updateAddress),
  deleteAddress: asyncHandler(deleteAddress),
  setDefaultAddress: asyncHandler(setDefaultAddress)
};
