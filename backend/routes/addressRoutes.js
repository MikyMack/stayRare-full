// routes/addressRoutes.js
const express = require('express');
const router = express.Router();
const Address = require('../models/Address');
const isUser = require('../middleware/isUser');

// ➕ Create Address
router.post('/create-address', isUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Address.countDocuments({ user: userId });

    if (count >= 5) {
      return res.status(400).json({ message: 'Maximum 5 addresses allowed' });
    }

    // If isDefault true, unset others
    if (req.body.isDefault) {
      await Address.updateMany({ user: userId }, { $set: { isDefault: false } });
    }

    const newAddress = new Address({ ...req.body, user: userId });
    await newAddress.save();
    res.status(201).json(newAddress);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
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
