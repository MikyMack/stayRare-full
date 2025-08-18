const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [
        {
            product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            name: String,
            selectedColor: String,
            selectedSize: String,
            quantity: Number,
            price: Number
        }
    ],
    billingAddress: {
        name: String,
        phone: String,
        pincode: String,
        state: String,
        city: String,
        district: String,
        addressLine1: String,
        addressLine2: String,
        landmark: String,
        addressType: String
    },
    shippingAddress: {
        name: String,
        phone: String,
        pincode: String,
        state: String,
        city: String,
        district: String,
        addressLine1: String,
        addressLine2: String,
        landmark: String,
        addressType: String
    },
    couponUsed: {
        code: String,
        discountType: String,
        discountValue: Number,
        discountAmount: Number,
        couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' }
    },
    paymentInfo: {
        razorpayPaymentId: String,
        razorpayOrderId: String,
        status: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' }
    },
    deliveryInfo: {
        courier: { type: String, default: 'Shiprocket' },
        shipmentId: String,
        trackingId: String,
        awbCode: String,
        labelUrl: String,
        status: { 
            type: String, 
            enum: [
             
                'Pending',
                'Processing',
                'Pickup Generated', 
                'Shipped',
                'In Transit',
                'Out for Delivery',
                'Delivered',
                'Returned',
                'Cancelled',
                'Canceled',  
                'Failed'
            ], 
            default: 'Pending' 
        },
        trackingHistory: [{
            status: String,
            original_status: String,
            location: String,
            remark: String,
            awb: String,
            updated_date: String,
            date: Date,
            courier_name: String,
            pod_status: String,
            edd: String
        }],
        estimatedDelivery: Date,
        error: String,
        updatedAt: Date
    },
    totalAmount: Number,
    orderStatus: { 
        type: String, 
        enum: [
            'Pending',
            'Confirmed',
            'Processing',
            'Shipped',
            'Delivered',
            'Cancelled',
            'Canceled',  
            'Returned'
        ],
        default: 'Pending' 
    },
    isReplacement: { type: Boolean, default: false },
    originalOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    replacementReason: String,
    replacementStatus: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Processing', 'Completed'],
        default: 'Pending'
    }
}, { timestamps: true });

// Check if the model has already been compiled
module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);