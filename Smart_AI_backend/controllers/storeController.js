const Store = require('../models/Store');

/**
 * Get all active stores
 * Public route
 */
const getAllStores = async (req, res) => {
  try {
    const { search, lat, lng } = req.query;
    
    let filter = { isActive: true };
    
    // Text search if provided
    if (search) {
      filter.$text = { $search: search };
    }
    
    let stores;
    
    // If coordinates provided, sort by distance
    if (lat && lng) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({
          success: false,
          message: 'Tọa độ không hợp lệ'
        });
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

  } catch (error) {
    console.error('Lỗi khi lấy danh sách cửa hàng:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách cửa hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get store by ID
 * Public route
 */
const getStoreById = async (req, res) => {
  try {
    const storeId = req.params.id;
    
    const store = await Store.findOne({
      _id: storeId,
      isActive: true
    });
    
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cửa hàng'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Lấy thông tin cửa hàng thành công',
      data: store
    });
    
  } catch (error) {
    console.error('Lỗi khi lấy thông tin cửa hàng:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thông tin cửa hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create new store
 * Admin only
 */
const createStore = async (req, res) => {
  try {
    const { name, address, location, phone, email, businessHours, images, description } = req.body;
    
    // Validate required fields
    if (!name || !address || !location || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: name, address, location, phone'
      });
    }
    
    // Validate address fields
    if (!address.street || !address.district || !address.city || !address.fullAddress) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin địa chỉ: street, district, city, fullAddress'
      });
    }
    
    // Validate location coordinates
    if (!location.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Tọa độ không hợp lệ'
      });
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
    
  } catch (error) {
    console.error('Lỗi khi tạo cửa hàng:', error.message);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi tạo cửa hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * Update store
 * Admin only
 */
const updateStore = async (req, res) => {
  try {
    const storeId = req.params.id;
    const { name, address, location, phone, email, businessHours, images, description } = req.body;
    
    const store = await Store.findById(storeId);
    
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cửa hàng'
      });
    }
    
    // Update fields if provided
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
    
  } catch (error) {
    console.error('Lỗi khi cập nhật cửa hàng:', error.message);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật cửa hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete store (hard delete)
 * Admin only
 */
const deleteStore = async (req, res) => {
  try {
    const storeId = req.params.id;
    
    const store = await Store.findByIdAndDelete(storeId);
    
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cửa hàng'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Xóa cửa hàng thành công'
    });
    
  } catch (error) {
    console.error('Lỗi khi xóa cửa hàng:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa cửa hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Toggle store active status
 * Admin only
 */
const toggleStoreActive = async (req, res) => {
  try {
    const storeId = req.params.id;
    
    const store = await Store.findById(storeId);
    
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cửa hàng'
      });
    }
    
    store.isActive = !store.isActive;
    const updatedStore = await store.save();
    
    res.status(200).json({
      success: true,
      message: store.isActive ? 'Đã kích hoạt cửa hàng' : 'Đã ẩn cửa hàng',
      data: updatedStore
    });
    
  } catch (error) {
    console.error('Lỗi khi thay đổi trạng thái cửa hàng:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi thay đổi trạng thái cửa hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all stores (including inactive) for admin
 * Admin only
 */
const getAllStoresAdmin = async (req, res) => {
  try {
    const stores = await Store.find().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách cửa hàng thành công',
      data: stores
    });
    
  } catch (error) {
    console.error('Lỗi khi lấy danh sách cửa hàng:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách cửa hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getAllStores,
  getStoreById,
  createStore,
  updateStore,
  deleteStore,
  toggleStoreActive,
  getAllStoresAdmin
};
