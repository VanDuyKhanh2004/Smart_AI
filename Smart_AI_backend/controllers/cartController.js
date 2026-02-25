const Cart = require('../models/Cart');
const Product = require('../models/Product');

// Get user's cart with populated product details
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        select: '-embedding_vector'
      });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    res.status(200).json({
      success: true,
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy giỏ hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Add item to cart with duplicate merge logic
const addItem = async (req, res) => {
  try {
    const { productId, quantity, color } = req.body;

    if (!productId || !quantity || !color) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin: productId, quantity, color là bắt buộc',
        code: 'INVALID_QUANTITY'
      });
    }

    if (quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Số lượng phải lớn hơn 0',
        code: 'INVALID_QUANTITY'
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

    // Get or create cart
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    // Check for existing item with same product and color
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId && item.color === color
    );

    let totalQuantity = quantity;
    if (existingItemIndex > -1) {
      totalQuantity += cart.items[existingItemIndex].quantity;
    }

    // Validate stock
    if (totalQuantity > product.inStock) {
      return res.status(400).json({
        success: false,
        message: `Số lượng vượt quá tồn kho. Chỉ còn ${product.inStock} sản phẩm`,
        code: 'INSUFFICIENT_STOCK'
      });
    }

    if (existingItemIndex > -1) {
      // Update existing item quantity
      cart.items[existingItemIndex].quantity = totalQuantity;
    } else {
      // Add new item
      cart.items.push({
        product: productId,
        quantity,
        color,
        addedAt: new Date()
      });
    }

    await cart.save();

    // Populate and return
    cart = await Cart.findById(cart._id).populate({
      path: 'items.product',
      select: '-embedding_vector'
    });

    res.status(200).json({
      success: true,
      message: 'Đã thêm sản phẩm vào giỏ hàng',
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi thêm sản phẩm vào giỏ hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update item quantity with stock validation
const updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({
        success: false,
        message: 'Số lượng là bắt buộc',
        code: 'INVALID_QUANTITY'
      });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy giỏ hàng',
        code: 'ITEM_NOT_FOUND'
      });
    }

    const itemIndex = cart.items.findIndex(
      item => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm trong giỏ hàng',
        code: 'ITEM_NOT_FOUND'
      });
    }

    // If quantity is 0 or less, remove the item
    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
      await cart.save();

      cart = await Cart.findById(cart._id).populate({
        path: 'items.product',
        select: '-embedding_vector'
      });

      return res.status(200).json({
        success: true,
        message: 'Đã xóa sản phẩm khỏi giỏ hàng',
        data: cart
      });
    }

    // Check stock
    const product = await Product.findById(cart.items[itemIndex].product);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Cap quantity at stock if exceeds
    let finalQuantity = quantity;
    let warning = null;
    if (quantity > product.inStock) {
      finalQuantity = product.inStock;
      warning = `Số lượng đã được giới hạn ở ${product.inStock} (tồn kho hiện tại)`;
    }

    cart.items[itemIndex].quantity = finalQuantity;
    await cart.save();

    cart = await Cart.findById(cart._id).populate({
      path: 'items.product',
      select: '-embedding_vector'
    });

    res.status(200).json({
      success: true,
      message: warning || 'Đã cập nhật số lượng',
      warning,
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật giỏ hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// Remove item from cart
const removeItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy giỏ hàng',
        code: 'ITEM_NOT_FOUND'
      });
    }

    const itemIndex = cart.items.findIndex(
      item => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm trong giỏ hàng',
        code: 'ITEM_NOT_FOUND'
      });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    cart = await Cart.findById(cart._id).populate({
      path: 'items.product',
      select: '-embedding_vector'
    });

    res.status(200).json({
      success: true,
      message: 'Đã xóa sản phẩm khỏi giỏ hàng',
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa sản phẩm khỏi giỏ hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Clear entire cart
const clearCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    } else {
      cart.items = [];
      await cart.save();
    }

    res.status(200).json({
      success: true,
      message: 'Đã xóa tất cả sản phẩm khỏi giỏ hàng',
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa giỏ hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Merge guest cart with user cart on login
const mergeCart = async (req, res) => {
  try {
    const { items } = req.body; // Array of { productId, quantity, color }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'Items phải là một mảng',
        code: 'INVALID_QUANTITY'
      });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    for (const item of items) {
      const { productId, quantity, color } = item;

      if (!productId || !quantity || !color || quantity < 1) {
        continue; // Skip invalid items
      }

      // Check if product exists
      const product = await Product.findById(productId);
      if (!product) {
        continue; // Skip non-existent products
      }

      // Check for existing item with same product and color
      const existingItemIndex = cart.items.findIndex(
        cartItem => cartItem.product.toString() === productId && cartItem.color === color
      );

      if (existingItemIndex > -1) {
        // Sum quantities, cap at stock
        const newQuantity = Math.min(
          cart.items[existingItemIndex].quantity + quantity,
          product.inStock
        );
        cart.items[existingItemIndex].quantity = newQuantity;
      } else {
        // Add new item, cap at stock
        const cappedQuantity = Math.min(quantity, product.inStock);
        if (cappedQuantity > 0) {
          cart.items.push({
            product: productId,
            quantity: cappedQuantity,
            color,
            addedAt: new Date()
          });
        }
      }
    }

    await cart.save();

    cart = await Cart.findById(cart._id).populate({
      path: 'items.product',
      select: '-embedding_vector'
    });

    res.status(200).json({
      success: true,
      message: 'Đã merge giỏ hàng thành công',
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi merge giỏ hàng',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  mergeCart
};
