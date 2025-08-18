const mongoose = require('mongoose');

// Subcategory Schema (embedded in Category)
const SubcategorySchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true
    },
    imageUrl: { 
        type: String, 
        required: false
    },
    isActive: { 
        type: Boolean, 
        default: true 
    }
}, { _id: true }); 

// Category Schema
const CategorySchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true
    },
    imageUrl: { 
        type: String, 
        required: true
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    subCategories: [SubcategorySchema] 
}, { 
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true }
});

// Add a static method to find a category by subcategory ID
CategorySchema.statics.findBySubcategoryId = async function(subcategoryId) {
    return this.findOne({ 'subCategories._id': subcategoryId });
};

// Virtual property to get active subcategories only
CategorySchema.virtual('activeSubCategories').get(function() {
    return (this.subCategories || []).filter(sub => sub.isActive);
});


// Create index for better performance on subcategory queries
CategorySchema.index({ 'subCategories._id': 1 });

module.exports = mongoose.model('Category', CategorySchema);