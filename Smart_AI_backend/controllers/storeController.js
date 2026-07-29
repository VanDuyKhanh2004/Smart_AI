const Store = require('../models/Store');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../utils/errors');

/**
 * Get all active stores
 * Public route
 */
const getAllStores = asyncHandler(async (req, res) => {
  const { search, lat, lng } = req.query;

  let filter = { isActive: true };

  if (search) {
    filter.$text = { $search: search };
  }

  let stores;

  if (lat && lng) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      throw new BadRequestError('Tọa độ không hợp lệ');
    }

    stores = await Store.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          distanceField: 'distance',
          spherical: true,
          query: filter
        }
      },
      {
        $addFields: {
          distanceKm: { $divide: ['$distance', 1000] }
        }
      }
    ]);
  } else {
    stores = await Store.find(filter).sort({ name: 1 });
  }

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách cửa hàng thành công',
    data: stores
  });
});

/**
 * Get store by ID
 * Public route
 */
const getStoreById = asyncHandler(async (req, res) => {
  const store = await Store.findOne({
    _id: req.params.id,
    isActive: true
  });

  if (!store) {
    throw new NotFoundError('Không tìm thấy cửa hàng');
  }

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin cửa hàng thành công',
    data: store
  });
});

/**
 * Create new store
 * Admin only
 */
const createStore = asyncHandler(async (req, res) => {
  const { name, address, location, phone, email, businessHours, images, description } = req.body;

  if (!name || !address || !location || !phone) {
    throw new BadRequestError('Thiếu thông tin bắt buộc: name, address, location, phone');
  }

  if (!address.street || !address.district || !address.city || !address.fullAddress) {
    throw new BadRequestError('Thiếu thông tin địa chỉ: street, district, city, fullAddress');
  }

  if (!location.coordinates || location.coordinates.length !== 2) {
    throw new BadRequestError('Tọa độ không hợp lệ');
  }

  const newStore = new Store({
    name,
    address,
    location: {
      type: 'Point',
      coordinates: location.coordinates
    },
    phone,
    email,
    businessHours,
    images,
    description
  });

  const savedStore = await newStore.save();

  res.status(201).json({
    success: true,
    message: 'Tạo cửa hàng thành công',
    data: savedStore
  });
});


/**
 * Update store
 * Admin only
 */
const updateStore = asyncHandler(async (req, res) => {
  const store = await Store.findById(req.params.id);

  if (!store) {
    throw new NotFoundError('Không tìm thấy cửa hàng');
  }

  const { name, address, location, phone, email, businessHours, images, description } = req.body;

  if (name) store.name = name;
  if (address) store.address = address;
  if (location && location.coordinates) {
    store.location = {
      type: 'Point',
      coordinates: location.coordinates
    };
  }
  if (phone) store.phone = phone;
  if (email !== undefined) store.email = email;
  if (businessHours) store.businessHours = businessHours;
  if (images) store.images = images;
  if (description !== undefined) store.description = description;

  const updatedStore = await store.save();

  res.status(200).json({
    success: true,
    message: 'Cập nhật cửa hàng thành công',
    data: updatedStore
  });
});

/**
 * Delete store (hard delete)
 * Admin only
 */
const deleteStore = asyncHandler(async (req, res) => {
  const store = await Store.findByIdAndDelete(req.params.id);

  if (!store) {
    throw new NotFoundError('Không tìm thấy cửa hàng');
  }

  res.status(200).json({
    success: true,
    message: 'Xóa cửa hàng thành công'
  });
});

/**
 * Toggle store active status
 * Admin only
 */
const toggleStoreActive = asyncHandler(async (req, res) => {
  const store = await Store.findById(req.params.id);

  if (!store) {
    throw new NotFoundError('Không tìm thấy cửa hàng');
  }

  store.isActive = !store.isActive;
  const updatedStore = await store.save();

  res.status(200).json({
    success: true,
    message: store.isActive ? 'Đã kích hoạt cửa hàng' : 'Đã ẩn cửa hàng',
    data: updatedStore
  });
});

/**
 * Get all stores (including inactive) for admin
 * Admin only
 */
const getAllStoresAdmin = asyncHandler(async (req, res) => {
  const stores = await Store.find().sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách cửa hàng thành công',
    data: stores
  });
});

module.exports = {
  getAllStores,
  getStoreById,
  createStore,
  updateStore,
  deleteStore,
  toggleStoreActive,
  getAllStoresAdmin
};
