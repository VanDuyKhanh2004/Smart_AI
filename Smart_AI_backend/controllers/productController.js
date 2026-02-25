const Product = require('../models/Product');
const Review = require('../models/Review');
const { generateEmbedding } = require('../utils/openai');

const createProductDescription = (productData) => {
  const { name, brand, price, specs, description, colors } = productData;
  
  let descriptionParts = [];
  
  descriptionParts.push(`${name}`);
  descriptionParts.push(`${brand}`);
  descriptionParts.push(`${price}`);
  
  if (description) {
    descriptionParts.push(`${description}`);
  }
  
  if (specs) {
    if (specs.screen) {
      if (specs.screen.size) descriptionParts.push(`${specs.screen.size}`);
      if (specs.screen.technology) descriptionParts.push(`${specs.screen.technology}`);
      if (specs.screen.resolution) descriptionParts.push(`${specs.screen.resolution}`);
    }
    
    if (specs.processor) {
      if (specs.processor.chipset) descriptionParts.push(`${specs.processor.chipset}`);
      if (specs.processor.cpu) descriptionParts.push(`${specs.processor.cpu}`);
      if (specs.processor.gpu) descriptionParts.push(`${specs.processor.gpu}`);
    }
    
    if (specs.memory) {
      if (specs.memory.ram) descriptionParts.push(`${specs.memory.ram}`);
      if (specs.memory.storage) descriptionParts.push(`${specs.memory.storage}`);
    }
    
    if (specs.camera) {
      if (specs.camera.rear) {
        if (specs.camera.rear.primary) descriptionParts.push(`${specs.camera.rear.primary}`);
        if (specs.camera.rear.secondary) descriptionParts.push(`${specs.camera.rear.secondary}`);
        if (specs.camera.rear.tertiary) descriptionParts.push(`${specs.camera.rear.tertiary}`);
      }
      if (specs.camera.front) descriptionParts.push(`${specs.camera.front}`);
      if (specs.camera.features && specs.camera.features.length > 0) {
        descriptionParts.push(`${specs.camera.features.join(', ')}`);
      }
    }
    
    if (specs.battery) {
      if (specs.battery.capacity) descriptionParts.push(`${specs.battery.capacity}`);
      if (specs.battery.charging) {
        if (specs.battery.charging.wired) descriptionParts.push(`${specs.battery.charging.wired}`);
        if (specs.battery.charging.wireless) descriptionParts.push(`${specs.battery.charging.wireless}`);
      }
    }
    
    if (specs.os) descriptionParts.push(`${specs.os}`);
    
    if (specs.dimensions) descriptionParts.push(`${specs.dimensions}`);
    if (specs.weight) descriptionParts.push(`${specs.weight}`);
    
    if (specs.connectivity) {
      if (specs.connectivity.network && specs.connectivity.network.length > 0) {
        descriptionParts.push(`${specs.connectivity.network.join(', ')}`);
      }
      if (specs.connectivity.ports && specs.connectivity.ports.length > 0) {
        descriptionParts.push(`${specs.connectivity.ports.join(', ')}`);
      }
    }
  }
  
  if (colors && colors.length > 0) {
    descriptionParts.push(`${colors.join(', ')}`);
  }  
  return descriptionParts.join('. ');
};


const createProduct = async (req, res) => {
  try {
    console.log('Tạo sản phẩm mới:', req.body.name);
    
    const { name, brand, price, specs, description, inStock, colors, tags, image } = req.body;
    
    if (!name || !brand || !price || !description) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: name, brand, price, description'
      });
    }
    
    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      brand: brand.toLowerCase()
    });
    
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Sản phẩm đã tồn tại với tên và hãng này'
      });
    }
    
    const fullDescription = createProductDescription(req.body);
    console.log('Description được tạo:', fullDescription.substring(0, 200) + '...');
    
    console.log('Đang tạo embedding vector...');
    const embeddingVector = await generateEmbedding(fullDescription);
    console.log('Embedding vector đã được tạo');
    
    const newProduct = new Product({
      name,
      brand: brand.toLowerCase(),
      price,
      specs: specs || {},
      description,
      inStock: inStock || 0,
      colors: colors || [],
      tags: tags || [],
      embedding_vector: embeddingVector,
      image: image || ''
    });
    
    const savedProduct = await newProduct.save();
    console.log('Sản phẩm đã được lưu với ID:', savedProduct._id);
    
    res.status(201).json({
      success: true,
      message: 'Sản phẩm đã được tạo thành công',
      data: savedProduct
    });
    
  } catch (error) {
    console.error('Lỗi khi tạo sản phẩm:', error.message);
    
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
      message: 'Lỗi server khi tạo sản phẩm',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Lấy tất cả sản phẩm với pagination
const getAllProducts = async (req, res) => {
  try {
    // Lấy parameters từ query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const minRating = req.query.minRating ? parseFloat(req.query.minRating) : null;
    
    let filter = { isActive: true };
    
    if (req.query.brand) {
      filter.brand = req.query.brand.toLowerCase();
    }
    
    if (req.query.minPrice || req.query.maxPrice) {
      filter.price = {};
      if (req.query.minPrice) {
        filter.price.$gte = parseFloat(req.query.minPrice);
      }
      if (req.query.maxPrice) {
        filter.price.$lte = parseFloat(req.query.maxPrice);
      }
    }
    
    if (req.query.inStock !== undefined) {
      if (req.query.inStock === 'true') {
        filter.inStock = { $gt: 0 };
      } else if (req.query.inStock === 'false') {
        filter.inStock = 0;
      }
    }
    
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }
    
    let sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; 
    }
    
    // Use aggregation to include rating stats
    const aggregationPipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'reviews',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$product', '$$productId'] },
                    { $eq: ['$status', 'approved'] }
                  ]
                }
              }
            }
          ],
          as: 'reviews'
        }
      },
      {
        $addFields: {
          reviewCount: { $size: '$reviews' },
          averageRating: {
            $cond: {
              if: { $gt: [{ $size: '$reviews' }, 0] },
              then: { $round: [{ $avg: '$reviews.rating' }, 1] },
              else: 0
            }
          }
        }
      },
      // Filter by minRating if specified
      ...(minRating ? [{ $match: { averageRating: { $gte: minRating } } }] : []),
      {
        $project: {
          embedding_vector: 0,
          reviews: 0
        }
      }
    ];
    
    // Get total count with rating filter applied
    const countPipeline = [
      ...aggregationPipeline.slice(0, minRating ? 4 : 3),
      ...(minRating ? [{ $match: { averageRating: { $gte: minRating } } }] : []),
      { $count: 'total' }
    ];
    
    // Add sorting, skip, and limit
    const dataPipeline = [
      ...aggregationPipeline,
      { $sort: sort },
      { $skip: skip },
      { $limit: limit }
    ];
    
    const [products, countResult] = await Promise.all([
      Product.aggregate(dataPipeline),
      Product.aggregate(countPipeline)
    ]);
    
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách sản phẩm thành công',
      data: {
        products,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? page + 1 : null,
          prevPage: hasPrevPage ? page - 1 : null
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách sản phẩm',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Lấy chi tiết sản phẩm theo ID
const getProductById = async (req, res) => {
  try {
    const productId = req.params.id;
          
    // Tìm sản phẩm theo ID
    const product = await Product.findOne({
      _id: productId,
      isActive: true
    }).select('-embedding_vector').lean();
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm'
      });
    }
    
    // Get rating stats for the product
    const reviewStats = await Review.getProductStats(productId);
    
    // Add rating stats to product response
    const productWithStats = {
      ...product,
      averageRating: reviewStats.averageRating,
      reviewCount: reviewStats.totalCount
    };
        
    res.status(200).json({
      success: true,
      message: 'Lấy chi tiết sản phẩm thành công',
      data: productWithStats
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy chi tiết sản phẩm',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete product (soft delete by setting isActive = false)
 */
const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    // Find and soft delete the product
    const product = await Product.findByIdAndUpdate(
      productId,
      { isActive: false },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Không tìm thấy sản phẩm'
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Xóa sản phẩm thành công'
    });

  } catch (error) {
    console.error('Lỗi khi xóa sản phẩm:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi xóa sản phẩm'
      }
    });
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  deleteProduct
};
