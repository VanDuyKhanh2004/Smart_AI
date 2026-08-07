const mongoose = require('mongoose');

const businessHourSchema = new mongoose.Schema({
  open: {
    type: String,
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Giờ mở cửa không hợp lệ (HH:MM)']
  },
  close: {
    type: String,
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Giờ đóng cửa không hợp lệ (HH:MM)']
  },
  isClosed: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const storeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên cửa hàng là bắt buộc'],
    trim: true,
    maxlength: [200, 'Tên cửa hàng không được vượt quá 200 ký tự']
  },
  
  address: {
    street: {
      type: String,
      required: [true, 'Địa chỉ đường là bắt buộc'],
      trim: true
    },
    ward: {
      type: String,
      trim: true
    },
    district: {
      type: String,
      required: [true, 'Quận/Huyện là bắt buộc'],
      trim: true
    },
    city: {
      type: String,
      required: [true, 'Thành phố là bắt buộc'],
      trim: true
    },
    fullAddress: {
      type: String,
      required: [true, 'Địa chỉ đầy đủ là bắt buộc'],
      trim: true
    }
  },

  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, 'Tọa độ là bắt buộc'],
      validate: {
        validator: function(v) {
          if (!v || v.length !== 2) return false;
          const [lng, lat] = v;
          return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
        },
        message: 'Tọa độ không hợp lệ'
      }
    }
  },
  
  phone: {
    type: String,
    required: [true, 'Số điện thoại là bắt buộc'],
    match: [/^[0-9]{10,11}$/, 'Số điện thoại phải có 10-11 chữ số']
  },
  
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ']
  },
  
  businessHours: {
    monday: { type: businessHourSchema, default: () => ({ open: '08:00', close: '21:00', isClosed: false }) },
    tuesday: { type: businessHourSchema, default: () => ({ open: '08:00', close: '21:00', isClosed: false }) },
    wednesday: { type: businessHourSchema, default: () => ({ open: '08:00', close: '21:00', isClosed: false }) },
    thursday: { type: businessHourSchema, default: () => ({ open: '08:00', close: '21:00', isClosed: false }) },
    friday: { type: businessHourSchema, default: () => ({ open: '08:00', close: '21:00', isClosed: false }) },
    saturday: { type: businessHourSchema, default: () => ({ open: '08:00', close: '21:00', isClosed: false }) },
    sunday: { type: businessHourSchema, default: () => ({ open: '08:00', close: '21:00', isClosed: false }) }
  },
  
  images: [{
    type: String
  }],
  
  description: {
    type: String,
    maxlength: [1000, 'Mô tả không được vượt quá 1000 ký tự']
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  
  toObject: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Geospatial index for location queries
storeSchema.index({ location: '2dsphere' });
storeSchema.index({ isActive: 1 });
storeSchema.index({ name: 'text', 'address.fullAddress': 'text' });

// Static method to find stores near a location
storeSchema.statics.findNear = function(longitude, latitude, maxDistanceKm = 50) {
  return this.find({
    isActive: true,
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistanceKm * 1000 // Convert to meters
      }
    }
  });
};

// Static method to find all active stores
storeSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

module.exports = mongoose.model('Store', storeSchema);
