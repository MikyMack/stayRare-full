const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const isUser = require('../middleware/isUser');

// Add to wishlist
router.post('/create-wishlist', isUser, wishlistController.addToWishlist);

// Remove from wishlist
router.delete('/wishlist/:itemId', isUser, wishlistController.removeFromWishlist);

// Get wishlist
router.get('/all-wishlist', isUser, wishlistController.getWishlist);

// Move to cart
router.post('/wishlist/:itemId/move-to-cart', isUser, wishlistController.moveToCart);

module.exports = router;