const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  description: {
    type: String,
    default: ''
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  value: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(v) {
        return this.discountType !== 'percentage' || v <= 100;
      },
      message: 'Percentage discount cannot exceed 100%'
    }
  },
  minPurchase: {
    type: Number,
    default: 0,
    min: 0
  },
  validFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true
  },
  maxUses: {
    type: Number,
    default: null,
    min: 1
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  usedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  scopeType: {
    type: String,
    enum: ['all', 'categories', 'subcategories'],
    required: true,
    default: 'all'
  },
  applicableCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  applicableSubcategories: [{
    type: mongoose.Schema.Types.ObjectId
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

couponSchema.index({ code: 1, isActive: 1 });
couponSchema.pre('save', function(next) {
  this.code = this.code.toUpperCase();
  next();
});

module.exports = mongoose.model('Coupon', couponSchema);
