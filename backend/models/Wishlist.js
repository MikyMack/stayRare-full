const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  selectedColor: {
    type: String,
    required: function() {
      return this.product?.hasColorVariants;
    }
  },
  selectedSize: {
    type: String,
    required: function() {
      return this.product?.hasSizeVariants;
    }
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [wishlistItemSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
wishlistSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add virtuals for easier frontend access
wishlistSchema.virtual('itemsWithDetails', {
  ref: 'Product',
  localField: 'items.product',
  foreignField: '_id',
  justOne: false
});

// Add toJSON transform to include virtuals
wishlistSchema.set('toJSON', { virtuals: true });
wishlistSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);