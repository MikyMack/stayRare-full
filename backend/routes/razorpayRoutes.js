const express = require('express');
const router = express.Router();
const razorpayInstance = require('../utils/razorpay'); // Adjust path as needed

router.post('/create-razorpay-order', async (req, res) => {
  const { amount } = req.body;

  const options = {
    amount: amount * 100,
    currency: "INR",
    receipt: `receipt_order_${Date.now()}`
  };

  try {
    const response = await razorpayInstance.orders.create(options);
    res.json({
      success: true,
      razorpayOrderId: response.id,
      amount: response.amount,
      currency: response.currency
    });
  } catch (err) {
    console.error('Razorpay error:', err);
    res.status(500).json({ success: false, error: 'Razorpay order creation failed' });
  }
});

module.exports = router;
