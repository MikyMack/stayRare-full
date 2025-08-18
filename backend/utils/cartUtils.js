// utils/cartHelpers.js
const Cart = require('../models/Cart');
const Coupon = require('../models/Coupon');

const createEmptyCart = () => ({
    items: [],
    subtotal: 0,
    discountAmount: 0,
    total: 0,
    couponInfo: null
});

const recalculateCartTotals = (cart) => {
    cart.subtotal = cart.items.reduce((sum, item) => 
        sum + (item.price * item.quantity), 0);
    
    if (cart.couponInfo?.validated) {
        cart.discountAmount = cart.couponInfo.discountType === 'percentage'
            ? cart.subtotal * (cart.couponInfo.discountValue / 100)
            : cart.couponInfo.discountValue;
    } else {
        cart.discountAmount = 0;
    }
    
    cart.total = Math.max(0, cart.subtotal - cart.discountAmount);
    return cart;
};

const validateCartCoupon = async (cart) => {
    if (!cart.couponInfo?.code) return cart;

    const coupon = await Coupon.findOne({
        code: cart.couponInfo.code,
        isActive: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() },
        $or: [
            { maxUses: null },
            { $expr: { $lt: ["$usedCount", "$maxUses"] } }
        ]
    });

    if (!coupon) {
        cart.couponInfo = null;
        return recalculateCartTotals(cart);
    }

    // Check minimum purchase
    const subtotal = cart.items.reduce((sum, item) => 
        sum + (item.price * item.quantity), 0);
    
    if (subtotal < coupon.minPurchase) {
        cart.couponInfo = null;
        return recalculateCartTotals(cart);
    }

    // Update cart coupon info
    cart.couponInfo = {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.value,
        minPurchase: coupon.minPurchase,
        validated: true
    };

    return recalculateCartTotals(cart);
};

module.exports = {
    createEmptyCart,
    recalculateCartTotals,
    validateCartCoupon
};