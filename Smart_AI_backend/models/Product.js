const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên sản phẩm là bắt buộc'],
    trim: true,
    maxlength: [200, 'Tên sản phẩm không được vượt quá 200 ký tự']
  },
  image: {
    type: String,
  },
  
  brand: {
    type: String,
    required: [true, 'Hãng sản xuất là bắt buộc'],
    trim: true,
    lowercase: true,
  },
  
  price: {
    type: Number,
    required: [true, 'Giá sản phẩm là bắt buộc'],
    min: [0, 'Giá sản phẩm phải lớn hơn 0'],
    max: [100000000, 'Giá sản phẩm không hợp lệ']
  },
  
  specs: {
    screen: {
      size: {
        type: String, // VD: "6.7 inch"
        trim: true
      },
      resolution: {
        type: String, // VD: "2796 x 1290"
        trim: true
      },
      technology: {
        type: String, // VD: "Super Retina XDR OLED"
        trim: true
      }
    },
    
    processor: {
      chipset: {
        type: String, // VD: "Apple A17 Pro"
        trim: true
      },
      cpu: {
        type: String, // VD: "6-core"
        trim: true
      },
      gpu: {
        type: String, // VD: "6-core GPU"
        trim: true
      }
    },
    
    memory: {
      ram: {
        type: String, // VD: "8 GB"
        trim: true
      },
      storage: {
        type: String, // VD: "256 GB"
        trim: true
      },
      expandable: {
        type: Boolean,
        default: false
      }
    },
    
    camera: {
      rear: {
        primary: {
          type: String, // VD: "48 MP"
          trim: true
        },
        secondary: {
          type: String, // VD: "12 MP ultrawide"
          trim: true
        },
        tertiary: {
          type: String, // VD: "12 MP telephoto"
          trim: true
        }
      },
      front: {
        type: String, // VD: "12 MP"
        trim: true
      },
      features: [{
        type: String, // VD: ["Night mode", "Portrait mode", "4K video"]
        trim: true
      }]
    },
    
    battery: {
      capacity: {
        type: String, // VD: "4422 mAh"
        trim: true
      },
      charging: {
        wired: {
          type: String, // VD: "27W"
          trim: true
        },
        wireless: {
          type: String, // VD: "15W"
          trim: true
        }
      }
    },
    
    connectivity: {
      network: [{
        type: String, // VD: ["5G", "4G LTE", "Wi-Fi 6E"]
        trim: true
      }],
      ports: [{
        type: String, // VD: ["USB-C", "Lightning"]
        trim: true
      }]
    },
    
    os: {
      type: String, // VD: "iOS 17"
      trim: true
    },
    
    dimensions: {
      type: String, // VD: "159.9 x 76.7 x 8.25 mm"
      trim: true
    },
    
    weight: {
      type: String, // VD: "221g"
      trim: true
    },
    
    colors: [{
      type: String, // VD: ["Natural Titanium", "Blue Titanium"]
      trim: true
    }]
  },
  
  description: {
    type: String,
    required: [true, 'Mô tả sản phẩm là bắt buộc'],
    trim: true,
    maxlength: [1000, 'Mô tả không được vượt quá 1000 ký tự']
  },
  
  inStock: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'Số lượng tồn kho không thể âm']
  },
  
  embedding_vector: {
    type: [Number],
    required: [true, 'Vector embedding là bắt buộc'],
    validate: {
      validator: function(v) {
        return v && v.length === 1536; // OpenAI text-embedding-3-small có 1536 dimensions
      },
      message: 'Vector embedding phải có đúng 1536 dimensions'
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  slug: {
    type: String,
    unique: true,
    sparse: true, // Cho phép null values
    trim: true,
    lowercase: true
  }
}, {
  timestamps: true, 
  
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  
  toObject: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});


productSchema.index({
  name: 'text',
  'brand': 'text',
  description: 'text',
  'specs.processor.chipset': 'text'
}, {
  weights: {
    name: 10,
    brand: 8,
    description: 5,
    'specs.processor.chipset': 6
  }
});

productSchema.index({ brand: 1 });
productSchema.index({ price: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ inStock: 1 });
productSchema.index({ createdAt: -1 });

productSchema.index({ brand: 1, price: 1 });
productSchema.index({ isActive: 1, inStock: 1 });

productSchema.pre('save', function(next) {
  if (this.isModified('name') || this.isNew) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Loại bỏ ký tự đặc biệt
      .replace(/\s+/g, '-') // Thay space bằng dấu gạch ngang
      .trim();
  }
  next();
});

productSchema.virtual('url').get(function() {
  return `/products/${this.slug || this._id}`;
});

productSchema.virtual('formattedPrice').get(function() {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(this.price);
});

productSchema.statics.findByBrand = function(brand) {
  return this.find({ 
    brand: brand.toLowerCase(), 
    isActive: true 
  });
};

productSchema.statics.findByPriceRange = function(minPrice, maxPrice) {
  return this.find({
    price: { $gte: minPrice, $lte: maxPrice },
    isActive: true
  });
};

productSchema.methods.isInStock = function() {
  return this.inStock > 0;
};

productSchema.methods.decreaseStock = function(quantity = 1) {
  if (this.inStock >= quantity) {
    this.inStock -= quantity;
    return this.save();
  } else {
    throw new Error('Không đủ hàng trong kho');
  }
};

module.exports = mongoose.model('Product', productSchema);
