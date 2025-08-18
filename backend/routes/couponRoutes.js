const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const isAdmin = require('../middleware/isAdmin');

// ▶️ Create a new coupon (Admin only)
router.post('/create-coupon', isAdmin, async (req, res) => {
  try {
    const {
      code,
      discountType,
      value,
      minPurchase = 0,
      validUntil,
      maxUses = null,
      applicableCategories = [],
      applicableSubcategories = [],
      scopeType = 'all',
      description
    } = req.body;

    // Validate validUntil date
    if (new Date(validUntil) <= new Date()) {
      return res.status(400).json({ error: 'End date must be in the future' });
    }

    const coupon = new Coupon({
      code,
      discountType,
      value,
      minPurchase,
      validFrom: new Date(),
      validUntil: new Date(validUntil),
      maxUses,
      applicableCategories,
      applicableSubcategories,
      scopeType,
      description
    });
    

    await coupon.save();
    res.status(201).json(coupon);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Coupon code already exists' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// ▶️ Update coupon (Admin only)
router.put('/update-coupon/:id', isAdmin, async (req, res) => {
  try {
    const allowedUpdates = [
      'description',
      'value',
      'minPurchase',
      'validUntil',
      'maxUses',
      'applicableCategories',
      'applicableSubcategories'
    ];

    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Invalid updates' });
    }

    if (updateData.validUntil && new Date(updateData.validUntil) <= new Date()) {
      return res.status(400).json({ error: 'End date must be in the future' });
    }

    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    res.status(200).json(coupon);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Coupon code already exists' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// ▶️ Toggle coupon active status (Admin only)
router.patch('/toggle-coupon/:id', isAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    res.status(200).json({
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`,
      coupon
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ▶️ Delete coupon (Admin only)
router.delete('/delete-coupon/:id', isAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }
    res.status(200).json({ message: 'Coupon deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ▶️ List all coupons (Admin only)
router.get('/coupons', isAdmin, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.status(200).json(coupons);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ▶️ Get coupon details (Admin only)
router.get('/coupons/:id', isAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }
    res.status(200).json(coupon);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;