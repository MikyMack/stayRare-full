// routes/addressRoutes.js
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Address = require('../models/Address');
const mongoose = require('mongoose');
const isUser = require('../middleware/isUser');
const Product = require('../models/Product');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  }
}); 
// ➕ Create Address
router.post('/create-address', async (req, res) => {
  try {
    let user = req.user;
    let addressEmail = req.body.email?.trim().toLowerCase() || '';

    // 1️⃣ Handle guest user creation
    if (!user) {
      const guestEmail = addressEmail.match(/^\S+@\S+\.\S+$/) ? addressEmail : `guest_${Date.now()}@example.com`;
      const guestName = req.body.name || 'Guest';

      user = await User.findOne({ email: guestEmail });
      if (!user) {
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        user = new User({
          name: guestName,
          email: guestEmail,
          password: hashedPassword,
          role: 'guest',
          isGuest: true
        });

        await user.save();

        // Send guest credentials if real email
        if (!guestEmail.startsWith('guest_')) {
          transporter.sendMail({
            from: process.env.EMAIL_USERNAME,
            to: guestEmail,
            subject: 'Your Guest Account Details',
            html: `<p>Hello ${guestName}, temporary account created. Email: ${guestEmail}, Password: ${tempPassword}</p>`
          }, err => {
            if (err) {
              // log error for sending email only
              console.error('Guest email error:', err);
            }
          });
        }
      }

      // Auto-login guest
      req.session.user = user;
      req.user = user;
      addressEmail = guestEmail;
    } else if (!addressEmail) {
      addressEmail = user.email;
    }

    // 2️⃣ Validate address fields
    const {
      name, phone, pincode, state, city, district,
      addressLine1, addressLine2, landmark,
      addressType, isDefault, cartItems = []
    } = req.body;

    if (!name || !phone || !pincode || !state || !city || !addressLine1) {
      return res.status(400).json({ message: 'Please fill all required fields' });
    }

    // Max 5 addresses
    const count = await Address.countDocuments({ user: user._id });
    if (count >= 5) {
      return res.status(400).json({ message: 'Maximum 5 addresses allowed' });
    }

    // Handle default address toggle
    if (isDefault) {
      await Address.updateMany({ user: user._id }, { $set: { isDefault: false } });
    }

    const address = await Address.create({
      user: user._id,
      name,
      email: addressEmail,
      phone,
      pincode,
      state,
      city,
      district: district || '',
      addressLine1,
      addressLine2: addressLine2 || '',
      landmark: landmark || '',
      addressType: addressType || 'Home',
      isDefault: !!isDefault
    });

    // 3️⃣ Merge guest cart items
    if (Array.isArray(cartItems) && cartItems.length > 0) {
      let cart = await Cart.findOne({ user: user._id });
      if (!cart) {
        cart = new Cart({ user: user._id, items: [] });
      }

      for (const item of cartItems) {
        const productId = item.product; // <- use 'product', not 'productId'
        if (!productId) {
          continue;
        }
      
        let product;
        try {
          product = await Product.findById(productId).lean();
        } catch (err) {
          // log product fetch errors
          console.error('[create-address] Error finding product:', productId, err);
          continue;
        }
      
        if (!product) {
          continue;
        }
      
        const existingItem = cart.items.find(
          i =>
            i.product?.toString() === product._id.toString() &&
            i.selectedColor === item.selectedColor &&
            i.selectedSize === item.selectedMeasurement
        );
      
        if (existingItem) {
          existingItem.quantity += Number(item.quantity) || 1;
        } else {
          cart.items.push({
            product: product._id,
            productName: item.name || product.name,
            productImage: item.image || product.images?.[0] || '',
            price: Number(item.price) || product.salePrice || product.basePrice,
            quantity: Number(item.quantity) || 1,
            selectedColor: item.selectedColor || null,
            selectedSize: item.selectedMeasurement || null
          });
        }
      }

      cart.recalculateTotals();
      await cart.save();
    }

    res.status(201).json({
      success: true,
      address,
      message: 'Address saved successfully and cart attached'
    });

  } catch (err) {
    console.error('Create address error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// 📋 List all addresses
router.get('/address', isUser, async (req, res) => {
  const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1 });
  res.json(addresses);
});

// ✏️ Edit Address
router.put('/edit-address/:id', isUser, async (req, res) => {
  const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
  if (!address) return res.status(404).json({ message: 'Address not found' });

  if (req.body.isDefault) {
    await Address.updateMany({ user: req.user._id }, { $set: { isDefault: false } });
  }

  Object.assign(address, req.body);
  await address.save();
  res.json(address);
});

// ❌ Delete Address
router.delete('/delete-address/:id', isUser, async (req, res) => {
  const result = await Address.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!result) return res.status(404).json({ message: 'Address not found' });
  res.json({ message: 'Address deleted' });
});

module.exports = router;
