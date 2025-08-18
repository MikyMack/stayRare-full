const Razorpay = require('razorpay');
const Order = require('../models/Order');
const shiprocketService = require('../services/shiprocketService');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Process Razorpay refund
async function processRazorpayRefund(paymentId, amount) {
  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: amount * 100, // Convert to paise
      speed: 'normal',
      notes: {
        reason: 'Customer requested cancellation'
      }
    });
    return refund;
  } catch (error) {
    console.error('Razorpay refund error:', error.error?.description || error.message);
    throw error;
  }
}

// Cancel order with Shiprocket and Razorpay integration
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    // Validate order can be cancelled
    const cancellableStatuses = ['Pending', 'Confirmed', 'Processing'];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order cannot be cancelled at this stage' 
      });
    }

    // Cancel Shiprocket shipment if exists
    if (order.deliveryInfo?.shipmentId) {
      try {
        await shiprocketService.cancelShipment(order.deliveryInfo.shipmentId);
      } catch (shiprocketError) {
        console.error('Shiprocket cancellation failed:', shiprocketError);
        // Continue with cancellation even if Shiprocket fails
      }
    }

    // Process Razorpay refund if payment exists
    if (order.paymentInfo?.razorpayPaymentId && order.paymentInfo?.status === 'Paid') {
      try {
        await processRazorpayRefund(
          order.paymentInfo.razorpayPaymentId, 
          order.totalAmount
        );
      } catch (refundError) {
        console.error('Refund processing failed:', refundError);
        throw new Error('Refund processing failed');
      }
    }

    // Update order status
    order.orderStatus = 'Cancelled';
    order.deliveryInfo.status = 'Cancelled';
    await order.save();

    return res.json({ 
      success: true, 
      message: 'Order cancelled and refund processed successfully' 
    });

  } catch (error) {
    console.error('Order cancellation error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error cancelling order',
      error: error.message 
    });
  }
};

// Handle product replacement requests
exports.requestReplacement = async (req, res) => {
  try {
    const { orderId, itemId, reason, otherReason } = req.body;
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    // Validate order is eligible for replacement
    if (order.orderStatus !== 'Delivered') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only delivered orders can be replaced' 
      });
    }

    // Find the item to replace
    const item = order.items.find(i => i._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: 'Item not found in order' 
      });
    }

    // Create replacement order
    const replacementOrder = new Order({
      user: order.user,
      items: [{
        product: item.product,
        name: item.name,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        quantity: item.quantity,
        price: item.price
      }],
      billingAddress: order.billingAddress,
      shippingAddress: order.shippingAddress,
      totalAmount: item.price,
      orderStatus: 'Pending',
      isReplacement: true,
      originalOrder: orderId,
      replacementReason: reason === 'Other' ? otherReason : reason
    });

    await replacementOrder.save();

    return res.json({ 
      success: true, 
      message: 'Replacement request created successfully',
      replacementOrderId: replacementOrder._id
    });

  } catch (error) {
    console.error('Replacement request error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error processing replacement request',
      error: error.message 
    });
  }
};