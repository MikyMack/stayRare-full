const Product = require('../models/Product');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const { uploadToS3 } = require('../middleware/uploadS3');

exports.getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, category, subcategory, isActive } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;
    if (typeof isActive !== 'undefined') query.isActive = isActive === 'true';

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    const count = await Product.countDocuments(query);

    res.json({
      success: true,
      products,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalProducts: count
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getProductsByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { limit = 10 } = req.query;

    let match = { isActive: true };

    switch(type) {
      case 'best-deals':
        match.bestDeals = true;
        break;
      case 'new-arrivals':
        match.newArrivals = true;
        break;
      case 'best-seller':
        match.bestSeller = true;
        break;
      case 'top-rated':
        match.topRated = true;
        break;
      case 'all':
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid product type' });
    }

    const products = await Product.aggregate([
      { $match: match },
      { $sample: { size: parseInt(limit) } }
    ]);

    const populatedProducts = await Product.populate(products, [
      { path: 'category', select: 'name' },
      { path: 'subcategory', select: 'name' }
    ]);

    res.json({
      success: true,
      products: populatedProducts
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};



// Get single product by ID
exports.getProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid Product ID' });
    }

    const product = await Product.findById(productId)
      .populate('category', 'name subCategories')

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, product });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      basePrice,
      salePrice,
      stock,
      category,
      subcategory,
      status,
      bestDeals,
      dealsOfTheDay,
      newArrivals,
      bestSeller,
      topRated,
      moreDetails,
      hasColorVariants,
      hasSizeVariants,
      colorVariants,
      sizeVariants,
      reviews,
      productDetails 
    } = req.body;

    if (!name || !basePrice || !description || !category || !status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, basePrice, description, category, status'
      });
    }

    let parsedColorVariants = [];
    let parsedSizeVariants = [];
    let parsedReviews = [];
    let images = [];
    const colorVariantImagesMap = {}; // Changed to store arrays of images

    if (req.files && req.files.length > 0) {
      // Process main images
      const mainImageFiles = req.files.filter(f => f.fieldname === 'mainImages' || f.fieldname.startsWith('mainImages['));
      images = await Promise.all(
        mainImageFiles.map(file => uploadToS3(file, 'products'))
      );
      
      // Process color variant images (now multiple images per variant)
      const colorVariantFiles = req.files.filter(file =>
        file.fieldname.includes('colorVariants') && 
        file.fieldname.includes('[images]')
      );

      // Group images by color variant ID
      await Promise.all(
        colorVariantFiles.map(async file => {
          const match = file.fieldname.match(/colorVariants\[([^\]]+)\]\[images\]\[(\d+)\]/);
          if (match && match[1] && match[2]) {
            const colorId = match[1];
            const imageIndex = match[2];
            const imageUrl = await uploadToS3(file, 'products/color-variants');
            
            if (!colorVariantImagesMap[colorId]) {
              colorVariantImagesMap[colorId] = [];
            }
            colorVariantImagesMap[colorId][imageIndex] = imageUrl;
          }
        })
      );

      // Also handle single image uploads for backward compatibility
      const singleColorVariantFiles = req.files.filter(file =>
        file.fieldname.includes('colorVariants') && 
        file.fieldname.includes('[image]') && // singular
        !file.fieldname.includes('[images]') // not plural
      );

      await Promise.all(
        singleColorVariantFiles.map(async file => {
          const match = file.fieldname.match(/colorVariants\[([^\]]+)\]\[image\]/);
          if (match && match[1]) {
            const colorId = match[1];
            const imageUrl = await uploadToS3(file, 'products/color-variants');
            
            if (!colorVariantImagesMap[colorId]) {
              colorVariantImagesMap[colorId] = [imageUrl];
            } else {
              colorVariantImagesMap[colorId].push(imageUrl);
            }
          }
        })
      );
    }

    if (colorVariants) {
      try {
        const raw = typeof colorVariants === 'string' ? JSON.parse(colorVariants) : colorVariants;
        parsedColorVariants = Object.entries(raw).map(([key, variant]) => {
          // Handle both single image (backward compatibility) and multiple images
          let variantImages = [];
          
          // Get uploaded images for this variant
          if (colorVariantImagesMap[key]) {
            variantImages = colorVariantImagesMap[key].filter(img => img);
          }
          
          // Also include existing images from the request
          if (variant.images && Array.isArray(variant.images)) {
            variantImages = [...variantImages, ...variant.images];
          } else if (variant.image) {
            // Backward compatibility with single image
            variantImages.push(variant.image);
          }

          return {
            color: variant.color,
            stock: variant.stock || 0,
            images: variantImages.length > 0 ? variantImages : undefined
          };
        });
      } catch (e) {
        console.error('Error parsing color variants:', e);
        return res.status(400).json({
          success: false,
          message: 'Invalid color variants format'
        });
      }
    }

    // Process size variants
    if (sizeVariants) {
      try {
        const raw = typeof sizeVariants === 'string' ? JSON.parse(sizeVariants) : sizeVariants;
        parsedSizeVariants = Object.values(raw).map(variant => ({
          size: variant.size,
          stock: variant.stock || 0,
          length: typeof variant.length !== 'undefined' ? variant.length : undefined,
          chest: typeof variant.chest !== 'undefined' ? variant.chest : undefined,
          sleeve: typeof variant.sleeve !== 'undefined' ? variant.sleeve : undefined
        }));
      } catch (e) {
        console.error('Error parsing size variants:', e);
        return res.status(400).json({
          success: false,
          message: 'Invalid size variants format'
        });
      }
    }

    // Process reviews
    if (reviews) {
      try {
        const raw = typeof reviews === 'string' ? JSON.parse(reviews) : reviews;
        parsedReviews = Array.isArray(raw) ? raw : Object.values(raw);
      } catch (e) {
        console.error('Error parsing reviews:', e);
        return res.status(400).json({
          success: false,
          message: 'Invalid reviews format'
        });
      }
    }

    // Process productdetails
    let parsedProductDetails = undefined;
    if (typeof productDetails !== 'undefined') {
      try {
        parsedProductDetails = typeof productDetails === 'string'
          ? JSON.parse(productDetails)
          : productDetails;
      } catch (e) {
        console.error('Error parsing productdetails:', e);
        return res.status(400).json({
          success: false,
          message: 'Invalid productdetails format'
        });
      }
    }

    const product = new Product({
      name,
      description,
      basePrice: parseFloat(basePrice),
      salePrice: salePrice ? parseFloat(salePrice) : undefined,
      stock: stock ? parseFloat(stock) : undefined,
      category,
      subcategory: subcategory || undefined,
      status,
      bestDeals: bestDeals === 'true' || bestDeals === true,
      dealsOfTheDay: dealsOfTheDay === 'true' || dealsOfTheDay === true,
      newArrivals: newArrivals === 'true' || newArrivals === true,
      bestSeller: bestSeller === 'true' || bestSeller === true,
      topRated: topRated === 'true' || topRated === true,
      moreDetails: moreDetails || undefined,
      hasColorVariants: hasColorVariants === 'true' || hasColorVariants === true,
      hasSizeVariants: hasSizeVariants === 'true' || hasSizeVariants === true,
      colorVariants: parsedColorVariants,
      sizeVariants: parsedSizeVariants,
      reviews: parsedReviews,
      images, 
      isActive: status !== 'inactive',
      productDetails: parsedProductDetails 
    });

    await product.save();

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });

  } catch (err) {
    console.error('Error creating product:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let images = [];

    // Handle existing main images
    if (req.body.existingMainImages) {
      let existingImages = req.body.existingMainImages;
      if (!Array.isArray(existingImages)) {
        if (typeof existingImages === 'string' && existingImages.startsWith('[')) {
          try {
            existingImages = JSON.parse(existingImages);
          } catch (e) {
            existingImages = [existingImages];
          }
        } else {
          existingImages = [existingImages];
        }
      }
      images = existingImages.filter(img => img);
    }

    // Handle new main image uploads
    if (req.files && req.files.length > 0) {
      let mainImageFiles = [];
      mainImageFiles.push(...req.files.filter(f => f.fieldname === 'mainImages' || f.fieldname === 'mainImages[]'));

      const indexedFiles = req.files
        .filter(f => /^mainImages\[\d+\]$/.test(f.fieldname))
        .sort((a, b) => {
          const aIdx = parseInt(a.fieldname.match(/^mainImages\[(\d+)\]$/)[1], 10);
          const bIdx = parseInt(b.fieldname.match(/^mainImages\[(\d+)\]$/)[1], 10);
          return aIdx - bIdx;
        });
      mainImageFiles.push(...indexedFiles);

      mainImageFiles = Array.from(new Set(mainImageFiles));

      if (mainImageFiles.length > 0) {
        const uploadedImages = await Promise.all(
          mainImageFiles.map(file => uploadToS3(file, 'products'))
        );
        images = [...images, ...uploadedImages];
      }
    }

    // --- Handle Color Variant Images (now array) ---
    const colorVariantImagesMap = {};
    if (req.files && req.files.length > 0) {
      // Process multiple images per color variant
      const colorVariantFiles = req.files.filter(file =>
        file.fieldname.includes('colorVariants') && 
        file.fieldname.includes('[images]')
      );

      await Promise.all(
        colorVariantFiles.map(async (file) => {
          const match = file.fieldname.match(/colorVariants\[([^\]]+)\]\[images\]\[(\d+)\]/);
          if (match && match[1] && match[2]) {
            const colorId = match[1];
            const imageIndex = match[2];
            const imageUrl = await uploadToS3(file, 'products/color-variants');
            
            if (!colorVariantImagesMap[colorId]) {
              colorVariantImagesMap[colorId] = [];
            }
            colorVariantImagesMap[colorId][imageIndex] = imageUrl;
          }
        })
      );

      // Also handle single image uploads for backward compatibility
      const singleColorVariantFiles = req.files.filter(file =>
        file.fieldname.includes('colorVariants') && 
        file.fieldname.includes('[image]') &&
        !file.fieldname.includes('[images]')
      );

      await Promise.all(
        singleColorVariantFiles.map(async (file) => {
          const match = file.fieldname.match(/colorVariants\[([^\]]+)\]\[image\]/);
          if (match && match[1]) {
            const colorId = match[1];
            const imageUrl = await uploadToS3(file, 'products/color-variants');
            
            if (!colorVariantImagesMap[colorId]) {
              colorVariantImagesMap[colorId] = [imageUrl];
            } else {
              colorVariantImagesMap[colorId].push(imageUrl);
            }
          }
        })
      );
    }

    let parsedColorVariants = [];
    if (req.body.colorVariants) {
        let rawColorVariants;
        try {
            rawColorVariants = typeof req.body.colorVariants === 'string'
                ? JSON.parse(req.body.colorVariants)
                : req.body.colorVariants;
        } catch (e) {
            console.error('Error parsing color variants:', e);
            rawColorVariants = {};
        }
    
        const deletedVariantIds = Array.isArray(req.body.deletedColorVariants) 
            ? req.body.deletedColorVariants 
            : req.body.deletedColorVariants ? [req.body.deletedColorVariants] : [];
    
        parsedColorVariants = Object.entries(rawColorVariants)
            .filter(([key]) => !deletedVariantIds.includes(key))
            .map(([key, variant]) => {
                const existing = product.colorVariants.find(cv =>
                    cv._id?.toString() === key || cv.color === variant.color
                ) || {};

                // Handle images - combine uploaded, existing, and new images
                let variantImages = [];
                
                // Add uploaded images
                if (colorVariantImagesMap[key]) {
                  variantImages = colorVariantImagesMap[key].filter(img => img);
                }
                
                // Add existing images that are kept
                if (variant.existingImages && Array.isArray(variant.existingImages)) {
                  variantImages = [...variantImages, ...variant.existingImages];
                } else if (variant.existingImage) {
                  // Backward compatibility
                  variantImages.push(variant.existingImage);
                }
                
                // Add new images from the request
                if (variant.images && Array.isArray(variant.images)) {
                  variantImages = [...variantImages, ...variant.images];
                } else if (variant.image) {
                  // Backward compatibility
                  variantImages.push(variant.image);
                }

                return {
                    _id: existing._id || key,
                    color: variant.color,
                    stock: variant.stock || 0,
                    images: variantImages.length > 0 ? variantImages : undefined
                };
            });
    } else {
        parsedColorVariants = [];
    }

    // --- Process Size Variants ---
    let parsedSizeVariants = [];
    if (req.body.sizeVariants) {
        let rawSizeVariants;
        try {
            rawSizeVariants = typeof req.body.sizeVariants === 'string'
                ? JSON.parse(req.body.sizeVariants)
                : req.body.sizeVariants;
        } catch (e) {
            console.error('Error parsing size variants:', e);
            rawSizeVariants = {};
        }

        const deletedVariantIds = Array.isArray(req.body.deletedSizeVariants) 
            ? req.body.deletedSizeVariants 
            : req.body.deletedSizeVariants ? [req.body.deletedSizeVariants] : [];

        parsedSizeVariants = Object.entries(rawSizeVariants)
            .filter(([key]) => !deletedVariantIds.includes(key))
            .map(([key, variant]) => ({
                _id: key,
                size: variant.size,
                stock: variant.stock || 0,
                length: typeof variant.length !== 'undefined' ? variant.length : undefined,
                chest: typeof variant.chest !== 'undefined' ? variant.chest : undefined,
                sleeve: typeof variant.sleeve !== 'undefined' ? variant.sleeve : undefined
            }));
    } else {
        parsedSizeVariants = [];
    }

    // --- Process Reviews ---
    let parsedReviews = [];
    if (req.body.reviews) {
      let rawReviews;
      try {
        rawReviews = typeof req.body.reviews === 'string'
          ? JSON.parse(req.body.reviews)
          : req.body.reviews;
      } catch (e) {
        console.error('Error parsing reviews:', e);
        rawReviews = [];
      }
      parsedReviews = Array.isArray(rawReviews) ? rawReviews : Object.values(rawReviews);
    } else {
      parsedReviews = product.reviews || [];
    }

    // --- Process productdetails ---
    let parsedProductDetails = product.productDetails;
    if (typeof req.body.productDetails !== 'undefined') {
      try {
        parsedProductDetails = typeof req.body.productDetails === 'string'
          ? JSON.parse(req.body.productDetails)
          : req.body.productDetails;
      } catch (e) {
        console.error('Error parsing productdetails:', e);
        return res.status(400).json({
          success: false,
          message: 'Invalid productdetails format'
        });
      }
    }

    // --- Update Product Fields ---
    product.name = req.body.name || product.name;
    product.description = req.body.description || product.description;
    product.basePrice = req.body.basePrice ? parseFloat(req.body.basePrice) : product.basePrice;
    product.salePrice = req.body.salePrice ? parseFloat(req.body.salePrice) : product.salePrice;
    product.stock = req.body.stock ? parseFloat(req.body.stock) : product.stock;
    product.category = req.body.category || product.category;
    product.subcategory = req.body.subcategory || product.subcategory;
    product.status = req.body.status || product.status;
    product.bestDeals = typeof req.body.bestDeals !== 'undefined'
      ? req.body.bestDeals === 'true' || req.body.bestDeals === true
      : product.bestDeals;
    product.dealsOfTheDay = typeof req.body.dealsOfTheDay !== 'undefined'
      ? req.body.dealsOfTheDay === 'true' || req.body.dealsOfTheDay === true
      : product.dealsOfTheDay;
    product.newArrivals = typeof req.body.newArrivals !== 'undefined'
      ? req.body.newArrivals === 'true' || req.body.newArrivals === true
      : product.newArrivals;
    product.bestSeller = typeof req.body.bestSeller !== 'undefined'
      ? req.body.bestSeller === 'true' || req.body.bestSeller === true
      : product.bestSeller;
    product.topRated = typeof req.body.topRated !== 'undefined'
      ? req.body.topRated === 'true' || req.body.topRated === true
      : product.topRated;
    product.moreDetails = typeof req.body.moreDetails !== 'undefined'
      ? req.body.moreDetails
      : product.moreDetails;
    product.hasColorVariants = typeof req.body.hasColorVariants !== 'undefined'
      ? req.body.hasColorVariants === 'true' || req.body.hasColorVariants === true
      : product.hasColorVariants;
    product.hasSizeVariants = typeof req.body.hasSizeVariants !== 'undefined'
      ? req.body.hasSizeVariants === 'true' || req.body.hasSizeVariants === true
      : product.hasSizeVariants;

    product.colorVariants = parsedColorVariants;
    product.sizeVariants = parsedSizeVariants;
    product.reviews = parsedReviews;
    product.images = images;
    product.isActive = product.status !== 'inactive';
    product.productDetails = parsedProductDetails;

    await product.save();

    return res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });

  } catch (err) {
    console.error('Error updating product:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};


// Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    // Optionally: delete images from Cloudinary here
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Toggle product active status
exports.toggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    product.isActive = !product.isActive;
    await product.save();
    res.json({
      success: true,
      message: 'Product status updated',
      isActive: product.isActive
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


