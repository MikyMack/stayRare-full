const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const isUser = require('../middleware/isUser');

// Helper function to validate variants
const validateVariants = (product, selectedColor, selectedSize) => {
  if (product.hasColorVariants && !selectedColor) {
    return { isValid: false, error: 'Color selection required' };
  }
  if (product.hasSizeVariants && !selectedSize) {
    return { isValid: false, error: 'Size selection required' };
  }
  return { isValid: true };
};

// Get cart items
router.get('/cartItems', isUser, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id })
      .populate('items.product', 'name price images');

    res.status(200).json(cart || { items: [] });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
  
});

// Add to cart or update quantity if exists
router.post('/add-cart', isUser, async (req, res) => {
  try {
    const { productId, quantity = 1, selectedColor = null, selectedSize = null, updateQuantity = false } = req.body;
    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ error: 'Product not available' });
    }
    const { isValid, error } = validateVariants(product, selectedColor, selectedSize);
    if (!isValid) return res.status(400).json({ error });

    let cart = await Cart.findOne({ user: req.user._id }) || 
               new Cart({ user: req.user._id, items: [] });

    const finalColor = product.hasColorVariants ? selectedColor : null;
    const finalSize = product.hasSizeVariants ? selectedSize : null;

    const existingItem = cart.items.find(item => 
      item.product.equals(productId) && 
      item.selectedColor === finalColor && 
      item.selectedSize === finalSize
    );

    if (existingItem) {
      if (updateQuantity) {
        // Set the quantity to the provided value
        existingItem.quantity = quantity;
      } else {
        // Add to the existing quantity
        existingItem.quantity += quantity;
      }
    } else {
      cart.items.push({
        product: productId,
        quantity,
        selectedColor: finalColor,
        selectedSize: finalSize,
        price: product.salePrice || product.basePrice,
        productName: product.name,
        productImage: product.images[0] || ''
      });
    }

    cart.recalculateTotals();
    await cart.save();

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update quantity of a specific cart item
router.put('/update-cart/:itemId', isUser, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found in cart' });

    item.quantity = quantity;
    cart.recalculateTotals();
    await cart.save();

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove item from cart
router.delete('/remove-cart/:itemId', isUser, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    cart.items.pull({ _id: req.params.itemId });
    cart.recalculateTotals();
    await cart.save();

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear cart
router.delete('/clear-cart', isUser, async (req, res) => {
  try {
    const cart = await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [], couponCode: null, couponType: null, discount: 0 } },
      { new: true }
    );
    res.status(200).json(cart || { items: [] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;