const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const Cart = require('../models/Cart');

// Add item to wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const { productId, selectedColor, selectedSize } = req.body;
    const userId = req.user._id;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.hasColorVariants && !product.hasSizeVariants) {
      if (!selectedColor) {
        return res.status(400).json({ error: 'Color selection is required for this product' });
      }
    }
    if (product.hasSizeVariants && !product.hasColorVariants) {
      if (!selectedSize) {
        return res.status(400).json({ error: 'Size selection is required for this product' });
      }
    }
    if (product.hasColorVariants && product.hasSizeVariants) {
      if (!selectedColor) {
        return res.status(400).json({ error: 'Color selection is required for this product' });
      }
      if (!selectedSize) {
        return res.status(400).json({ error: 'Size selection is required for this product' });
      }
    }

    if (product.hasColorVariants && !product.hasSizeVariants) {
      const colorVariant = product.colorVariants.find(v => v.color === selectedColor);
      if (!colorVariant || colorVariant.stock <= 0) {
        return res.status(400).json({ error: 'Selected color is out of stock' });
      }
    }

    if (product.hasSizeVariants && !product.hasColorVariants) {
      const sizeVariant = product.sizeVariants.find(v => v.size === selectedSize);
      if (!sizeVariant || sizeVariant.stock <= 0) {
        return res.status(400).json({ error: 'Selected size is out of stock' });
      }
    }

    if (product.hasColorVariants && product.hasSizeVariants) {

      const colorVariant = product.colorVariants.find(v => v.color === selectedColor);
      if (!colorVariant) {
        return res.status(400).json({ error: 'Selected color is not available' });
      }
      // If color variant has sizeVariants, check inside it
      if (Array.isArray(colorVariant.sizeVariants)) {
        const sizeVariant = colorVariant.sizeVariants.find(sv => sv.size === selectedSize);
        if (!sizeVariant || sizeVariant.stock <= 0) {
          return res.status(400).json({ error: 'Selected size is out of stock for this color' });
        }
      } else {
        // Fallback: check product-level sizeVariants
        const sizeVariant = product.sizeVariants.find(v => v.size === selectedSize);
        if (!sizeVariant || sizeVariant.stock <= 0) {
          return res.status(400).json({ error: 'Selected size is out of stock' });
        }
      }
    }

    // Find or create wishlist
    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      wishlist = new Wishlist({ user: userId, items: [] });
    }

    // Check if product already exists in wishlist (match on product, color, size)
    const existingItemIndex = wishlist.items.findIndex(item => 
      item.product.toString() === productId &&
      (item.selectedColor || null) === (selectedColor || null) &&
      (item.selectedSize || null) === (selectedSize || null)
    );

    if (existingItemIndex >= 0) {
      return res.status(400).json({ error: 'Product already in wishlist' });
    }

    // Add new item
    wishlist.items.push({
      product: productId,
      selectedColor: selectedColor || undefined,
      selectedSize: selectedSize || undefined
    });

    await wishlist.save();

    // Populate product details for response
    await wishlist.populate({
      path: 'items.product',
      select: 'name images basePrice salePrice hasColorVariants hasSizeVariants colorVariants sizeVariants'
    });

    res.status(201).json({
      success: true,
      wishlist: wishlist.items.find(item => item.product._id.toString() === productId &&
        (item.selectedColor || null) === (selectedColor || null) &&
        (item.selectedSize || null) === (selectedSize || null)
      )
    });

  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
};

// Remove item from wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const itemId = req.params.itemId;

    const wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) return res.status(404).send('Wishlist not found');

    wishlist.items = wishlist.items.filter(i => i.product.toString() !== itemId);
    await wishlist.save();

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};

// Get user's wishlist
exports.getWishlist = async (req, res) => {
    try {
      const userId = req.user._id;
  
      const wishlist = await Wishlist.findOne({ user: userId })
        .populate({
          path: 'items.product',
          select: 'name images basePrice salePrice hasColorVariants hasSizeVariants colorVariants sizeVariants stock'
        });
  
      if (!wishlist) {
        return res.status(200).json({ items: [] }); // Explicit status code
      }
  
      // Check stock availability for each item
      const itemsWithStock = wishlist.items.map(item => {
        const product = item.product;
        let available = true;
        let stockMessage = 'In stock';
  
        if (product.hasColorVariants) {
          const colorVariant = product.colorVariants.find(v => v.color === item.selectedColor);
          if (!colorVariant || colorVariant.stock <= 0) {
            available = false;
            stockMessage = 'Color out of stock';
          }
        }
  
        if (product.hasSizeVariants && available) {
          const sizeVariant = product.sizeVariants.find(v => v.size === item.selectedSize);
          if (!sizeVariant || sizeVariant.stock <= 0) {
            available = false;
            stockMessage = 'Size out of stock';
          }
        }
  
        if (!product.hasColorVariants && !product.hasSizeVariants && product.stock <= 0) {
          available = false;
          stockMessage = 'Out of stock';
        }
  
        return {
          ...item.toObject(),
          available,
          stockMessage,
          currentPrice: product.salePrice > 0 ? product.salePrice : product.basePrice
        };
      });
  
      res.status(200).json({ items: itemsWithStock });
  
    } catch (error) {
      console.error('Error fetching wishlist:', error);
      res.status(500).json({ 
        error: 'Failed to fetch wishlist',
        details: error.message 
      });
    }
  };


  exports.moveToCart = async (req, res) => {
    try {
      const userId = req.user._id;
      const itemId = req.params.itemId;
  
      const wishlist = await Wishlist.findOne({ user: userId }).populate({
        path: 'items.product',
        select: 'salePrice basePrice name images'
      });
  
      if (!wishlist) return res.status(404).send('Wishlist not found');
  
      const item = wishlist.items.find(i => i.product && i.product._id.toString() === itemId);
      if (!item) return res.status(404).send('Item not found');
  
      const product = item.product;
  
      const price = product.salePrice || product.basePrice;
  
      await Cart.findOneAndUpdate(
        { user: userId },
        {
          $push: {
            items: {
              product: product._id,
              quantity: 1,
              selectedColor: item.selectedColor || null,
              selectedSize: item.selectedSize || null,
              price: price,
              productName: product.name,
              productImage: product.images?.[0] || ''
            }
          }
        },
        { upsert: true }
      );
  
      // Remove item from wishlist
      wishlist.items = wishlist.items.filter(i => i.product._id.toString() !== itemId);
      await wishlist.save();
  
      res.sendStatus(200);
    } catch (err) {
      console.error('Error moving item to cart:', err);
      res.sendStatus(500);
    }
  };
  
