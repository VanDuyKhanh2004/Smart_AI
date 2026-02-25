const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

// Get user's wishlist with populated product details
// Requirements: 3.1, 3.2, 4.1
const getWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        select: 'name image brand price inStock isActive specs.colors'
      });

    // Create empty wishlist if not exists
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, items: [] });
    }

    // Transform items to include colors at top level for easier frontend access
    const transformedItems = wishlist.items.map(item => {
      const itemObj = item.toObject ? item.toObject() : item;
      if (itemObj.product && itemObj.product.specs) {
        itemObj.product.colors = itemObj.product.specs.colors || [];
        delete itemObj.product.specs;
      }
      return itemObj;
    });

    res.status(200).json({
      success: true,
      data: {
        ...wishlist.toObject(),
        items: transformedItems
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy wishlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Add product to wishlist
// Requirements: 1.1, 1.2, 4.2
const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'productId là bắt buộc',
        code: 'INVALID_PRODUCT_ID'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Get or create wishlist
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user._id, items: [] });
    }

    // Check if product already in wishlist (reject if duplicate)
    const existingItem = wishlist.items.find(
      item => item.product.toString() === productId
    );

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Sản phẩm đã có trong wishlist',
        code: 'ALREADY_IN_WISHLIST'
      });
    }

    // Add product with addedAt timestamp
    wishlist.items.push({
      product: productId,
      addedAt: new Date()
    });

    await wishlist.save();

    // Populate and return
    wishlist = await Wishlist.findById(wishlist._id).populate({
      path: 'items.product',
      select: 'name image brand price inStock isActive specs.colors'
    });

    // Transform items
    const transformedItems = wishlist.items.map(item => {
      const itemObj = item.toObject ? item.toObject() : item;
      if (itemObj.product && itemObj.product.specs) {
        itemObj.product.colors = itemObj.product.specs.colors || [];
        delete itemObj.product.specs;
      }
      return itemObj;
    });

    res.status(200).json({
      success: true,
      message: 'Đã thêm sản phẩm vào wishlist',
      data: {
        ...wishlist.toObject(),
        items: transformedItems
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi thêm sản phẩm vào wishlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Remove product from wishlist
// Requirements: 2.1, 2.2
const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'productId là bắt buộc',
        code: 'INVALID_PRODUCT_ID'
      });
    }

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy wishlist',
        code: 'NOT_IN_WISHLIST'
      });
    }

    // Find and remove product from wishlist items
    const itemIndex = wishlist.items.findIndex(
      item => item.product.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Sản phẩm không có trong wishlist',
        code: 'NOT_IN_WISHLIST'
      });
    }

    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();

    // Populate and return
    wishlist = await Wishlist.findById(wishlist._id).populate({
      path: 'items.product',
      select: 'name image brand price inStock isActive specs.colors'
    });

    // Transform items
    const transformedItems = wishlist.items.map(item => {
      const itemObj = item.toObject ? item.toObject() : item;
      if (itemObj.product && itemObj.product.specs) {
        itemObj.product.colors = itemObj.product.specs.colors || [];
        delete itemObj.product.specs;
      }
      return itemObj;
    });

    res.status(200).json({
      success: true,
      message: 'Đã xóa sản phẩm khỏi wishlist',
      data: {
        ...wishlist.toObject(),
        items: transformedItems
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa sản phẩm khỏi wishlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Check if product is in wishlist (single product)
// Requirements: 7.1, 7.2
const checkWishlistStatus = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'productId là bắt buộc',
        code: 'INVALID_PRODUCT_ID'
      });
    }

    const wishlist = await Wishlist.findOne({ user: req.user._id });
    
    // Return false if no wishlist exists
    if (!wishlist) {
      return res.status(200).json({
        success: true,
        data: {
          productId,
          inWishlist: false
        }
      });
    }

    // Check if product exists in wishlist items
    const inWishlist = wishlist.items.some(
      item => item.product.toString() === productId
    );

    res.status(200).json({
      success: true,
      data: {
        productId,
        inWishlist
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi kiểm tra trạng thái wishlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Check multiple products wishlist status (for product list)
// Requirements: 7.1
const checkMultipleWishlistStatus = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({
        success: false,
        message: 'productIds phải là một mảng',
        code: 'INVALID_PRODUCT_IDS'
      });
    }

    const wishlist = await Wishlist.findOne({ user: req.user._id });
    
    // Build map of productId -> boolean
    const statusMap = {};
    
    if (!wishlist) {
      // No wishlist exists, all products are not in wishlist
      productIds.forEach(id => {
        statusMap[id] = false;
      });
    } else {
      // Check each product against wishlist items
      const wishlistProductIds = wishlist.items.map(
        item => item.product.toString()
      );
      
      productIds.forEach(id => {
        statusMap[id] = wishlistProductIds.includes(id);
      });
    }

    res.status(200).json({
      success: true,
      data: statusMap
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi kiểm tra trạng thái wishlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Clear entire wishlist
// Requirements: 2.1
const clearWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    
    if (!wishlist) {
      // Create empty wishlist if not exists
      wishlist = await Wishlist.create({ user: req.user._id, items: [] });
      return res.status(200).json({
        success: true,
        message: 'Wishlist đã trống',
        data: wishlist
      });
    }

    // Remove all items from wishlist
    wishlist.items = [];
    await wishlist.save();

    res.status(200).json({
      success: true,
      message: 'Đã xóa tất cả sản phẩm khỏi wishlist',
      data: wishlist
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa wishlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlistStatus,
  checkMultipleWishlistStatus,
  clearWishlist
};
