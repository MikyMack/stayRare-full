const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const crypto = require('crypto');
const cron = require("node-cron");
const bcrypt = require('bcryptjs');
require('dotenv').config();
const shiprocketService = require('../services/shiprocketService');
const { getOrdersWithTracking } = require('../services/orderService');
const orderController = require('../controllers/orderController');
const Category = require('../models/Category');
const Product = require('../models/Product');
const MainBanner = require('../models/MainBanner');
const BannerTwo = require('../models/BannerTwo');
const BannerThree = require('../models/BannerThree');
const MobileBanner = require('../models/mobilebanner');
const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');
const Address = require('../models/Address');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const Blog = require('../models/Blog');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const webPush = require("web-push");
const Subscription = require('../models/Subscription');
const Testimonial = require('../models/Testimonial');
const { createEmptyCart, validateCartCoupon } = require('../utils/cartUtils');
const isUser = require('../middleware/isUser');
const razorpayInstance = require('../utils/razorpay');
const sendInvoiceEmail = require("../utils/sendInvoice");
const { sendNotificationToUser,sendNotificationToAllUsers } = require("../services/notificationService");

const shuffleArray = (arr) => {
    if (!Array.isArray(arr)) return arr;
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]]; 
    }
    return arr;
};

router.get('/', async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true })
            .select('name imageUrl isActive subCategories')
            .lean();

        const mainBanner = await MainBanner.find({ isActive: true });
        const bannerTwo = await BannerTwo.find({ isActive: true });
        const bannerThree = await BannerThree.find({ isActive: true });
        const mobileBanner = await MobileBanner.find({ isActive: true });

        const allProducts = await Product.find({ isActive: true })
            .limit(20)
            .sort({ createdAt: -1 })
            .lean();

        // Randomize sections
        const bestDealsRaw = await Product.find({ isActive: true, bestDeals: true }).lean();
        const newArrivalsRaw = await Product.find({ isActive: true, newArrivals: true }).lean();
        const bestSellerRaw = await Product.find({ isActive: true, bestSeller: true }).lean();
        const topRatedRaw = await Product.find({ isActive: true, topRated: true }).lean();
        const dealsOfTheDayRaw = await Product.find({ isActive: true, dealsOfTheDay: true }).lean();

        const bestDeals = shuffleArray(bestDealsRaw).slice(0, 10);
        const newArrivals = shuffleArray(newArrivalsRaw).slice(0, 10);
        const bestSeller = shuffleArray(bestSellerRaw).slice(0, 10);
        const topRated = shuffleArray(topRatedRaw).slice(0, 10);
        const dealsOfTheDay = shuffleArray(dealsOfTheDayRaw).slice(0, 2); 

        const blogs = await Blog.find().sort({ createdAt: -1 }).limit(5).lean().catch(() => []);

        const activeCoupons = await Coupon.find({
            isActive: true,
            validUntil: { $gte: new Date() }
        }).select('code description').lean();

        // Fetch testimonials
        let testimonials = [];
        try {
            testimonials = await Testimonial.find({ isActive: true }).lean();
        } catch (testimonialErr) {
            testimonials = [];
        }

        let cart = null;
        if (req.user) {
            cart = await Cart.findOne({ user: req.user._id }).lean();
        }

        let wishlistCount = 0;
        if (req.user) {
            const wishlist = await Wishlist.findOne({ user: req.user._id }).lean();
            wishlistCount = wishlist?.items?.length || 0;
        }

        res.render('user/home', {
            user: req.user || null,
            categories,
            mainBanner,
            bannerTwo,
            bannerThree,
            mobileBanner,
            allProducts,
            bestDeals,
            dealsOfTheDay,
            newArrivals,
            bestSeller,
            topRated,
            cartItems: cart?.items || [],
            cartSubtotal: cart?.subtotal || 0,
            activeCoupons,
            blogs,
            wishlistCount,
            testimonials
        });

    } catch (err) {
        console.error('Error fetching homepage data:', err);
        res.render('user/home', {
            user: req.user || null,
            categories: [],
            mainBanner: [],
            bannerTwo: [],
            bannerThree: [],
            allProducts: [],
            bestDeals: [],
            dealsOfTheDay: [],
            newArrivals: [],
            bestSeller: [],
            topRated: [],
            cartItems: [],
            cartSubtotal: 0,
            activeCoupons: [],
            blogs: [],
            wishlistCount: 0,
            testimonials: []
        });
    }
});

// router.get('/', (req, res) => {
//     res.render('user/maintenance', {
//         user: req.user || null
//     });
// });


router.get('/about', async (req, res) => {
    const categories = await Category.find({ isActive: true })
        .select('name imageUrl isActive subCategories')
        .lean();

    const testimonials = await Testimonial.find({ isActive: true }).lean();
    let blogs = [];
    try {       
        blogs = await Blog.find().sort({ createdAt: -1 }).limit(5).lean();
    } catch (blogErr) {
        blogs = [];
    }

    let wishlistCount = 0;
    if (req.user) {
        const wishlist = await Wishlist.findOne({ user: req.user._id }).lean();
        wishlistCount = wishlist && wishlist.items ? wishlist.items.length : 0;
    }

    res.render('user/about', { 
        user: req.user || null, 
        categories, 
        testimonials,
        blogs,
        wishlistCount
    });
});
router.get('/store', async (req, res) => {
    try {
        let {
            page = 1,
            limit = 20,
            category,
            minPrice,
            maxPrice,
            size,
            color,
            sort = 'newest', 
            q,
            subcategory
        } = req.query;

        // Parse filters
        if (size) size = Array.isArray(size) ? size : size.split(',').filter(s => s.trim());
        if (color) color = Array.isArray(color) ? color : color.split(',').filter(c => c.trim());

        let filter = { isActive: true };

        const specialNewArrivalsCategory = "68401f815a149404380fc58f";
        const specialNewArrivalsSubcategory = "684020345a149404380fc594";
        const specialBestDealsCategory = "684023da5a149404380fc640";

        let isSpecialNewArrivals = false;
        let isSpecialBestDeals = false;

        // Subcategory filter
        if (subcategory && mongoose.Types.ObjectId.isValid(subcategory)) {
            if (subcategory === specialNewArrivalsSubcategory) {
                isSpecialNewArrivals = true;
            } else {
                filter.subcategory = subcategory;
            }
        }

        // Category filter
        if (category) {
            let decodedCategory = decodeURIComponent(category);

            if (category === specialNewArrivalsCategory) {
                isSpecialNewArrivals = true;
            } else if (category === specialBestDealsCategory) {
                isSpecialBestDeals = true;
            } else if (mongoose.Types.ObjectId.isValid(category)) {
                filter.category = category;
            } else {
                // Try to resolve by slug or name
                const foundCategory = await Category.findOne({
                    $or: [
                        { slug: decodedCategory },
                        { name: new RegExp('^' + decodedCategory + '$', 'i') }
                    ]
                }).lean();
                if (foundCategory) {
                    filter.category = foundCategory._id;
                }
            }
        }

        // Special categories override
        if (isSpecialNewArrivals) {
            filter = { isActive: true, newArrivals: true };
        } else if (isSpecialBestDeals) {
            filter = { isActive: true, bestDeals: true };
        }

        // Pagination: always use "page" param for all cases
        let effectivePage = Number(page) || 1;
        let currentPage = effectivePage;

        // Search
        if (q && typeof q === 'string' && q.trim()) {
            const keywords = q.trim().split(/\s+/).join('|');
            const searchRegex = new RegExp(keywords, 'i');
        
            const matchedCategories = await Category.find({
                $or: [
                    { 'subCategories.name': searchRegex }
                ]
            }).lean();
        
            const subcategoryIds = matchedCategories.flatMap(cat =>
                (cat.subCategories || []).filter(sub => searchRegex.test(sub.name)).map(sub => sub._id.toString())
            );
        
            filter.$or = [
                { name: searchRegex },
                { description: searchRegex },
                { moreDetails: searchRegex },
                { 'productDetails.productType': searchRegex },
                { 'productDetails.brand': searchRegex },
                { 'productDetails.productCollection': searchRegex },
                { subcategory: { $in: subcategoryIds } }
            ];
        }
        
        // Price filter
        if (minPrice || maxPrice) {
            const priceFilter = {};
            if (minPrice) priceFilter.$gte = Number(minPrice);
            if (maxPrice) priceFilter.$lte = Number(maxPrice);

            filter.$and = filter.$and || [];
            filter.$and.push({
                $or: [
                    { 
                        $and: [
                            { salePrice: { $gt: 0 } },
                            { salePrice: priceFilter }
                        ]
                    },
                    {
                        $and: [
                            { $or: [{ salePrice: 0 }, { salePrice: { $exists: false } }] },
                            { basePrice: priceFilter }
                        ]
                    }
                ]
            });
        }

        if (size?.length) filter['sizeVariants.size'] = { $in: size };
        if (color?.length) filter['colorVariants.color'] = { $in: color };

        const totalProducts = await Product.countDocuments(filter);

        // Sorting
        let sortObj = {};
        switch (sort) {
            case 'price-low':
                // Use aggregation for proper price sorting with pagination
                break;
            case 'price-high':
                // Use aggregation for proper price sorting with pagination
                break;
            case 'bestseller':
                sortObj = { soldCount: -1 };
                break;
            case 'featured':
                sortObj = { isFeatured: -1, createdAt: -1 };
                break;
            case 'az':
                sortObj = { name: 1 }; // A-Z alphabetical
                break;
            case 'za':
                sortObj = { name: -1 }; // Z-A alphabetical
                break;
            case 'newest':
            default:
                sortObj = { createdAt: -1 }; // Default: newest first
        }

        let products = [];
        
        // Use MongoDB aggregation for price sorting to maintain proper pagination
        if (sort === 'price-low' || sort === 'price-high') {
            const aggregationPipeline = [
                { $match: filter },
                {
                    $addFields: {
                        effectivePrice: {
                            $cond: {
                                if: { $and: [{ $gt: ['$salePrice', 0] }] },
                                then: '$salePrice',
                                else: '$basePrice'
                            }
                        }
                    }
                },
                { $sort: { effectivePrice: sort === 'price-low' ? 1 : -1 } },
                { $skip: (effectivePage - 1) * Number(limit) },
                { $limit: Number(limit) },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'category',
                        foreignField: '_id',
                        as: 'categoryInfo'
                    }
                },
                {
                    $unwind: {
                        path: '$categoryInfo',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        name: 1,
                        description: 1,
                        basePrice: 1,
                        salePrice: 1,
                        images: 1,
                        category: 1,
                        subcategory: 1,
                        isActive: 1,
                        newArrivals: 1,
                        bestDeals: 1,
                        isFeatured: 1,
                        soldCount: 1,
                        moreDetails: 1,
                        productDetails: 1,
                        sizeVariants: 1,
                        colorVariants: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        effectivePrice: 1,
                        'categoryInfo.name': 1
                    }
                }
            ];

            products = await Product.aggregate(aggregationPipeline);
        } else {
            // For all other sorting types, use regular find with sort
            products = await Product.find(filter)
                .skip((effectivePage - 1) * Number(limit))
                .limit(Number(limit))
                .sort(sortObj)
                .populate('category', 'name')
                .lean();
        }

        // Only send categories where isActive: true
        const categories = await Category.find({ isActive: true }).lean();
        const cart = req.user ? await Cart.findOne({ user: req.user._id }).lean() : null;

        let pageTitle = 'Store';
        if (isSpecialNewArrivals) {
            pageTitle = 'New Arrivals';
        } else if (isSpecialBestDeals) {
            pageTitle = 'Best Deals';
        } else if (subcategory) {
            const subcat = await Category.findOne({ 'subCategories._id': subcategory }, { 'subCategories.$': 1, name: 1 }).lean();
            if (subcat) pageTitle = `${subcat.name} - ${subcat.subCategories[0].name}`;
        } else if (category) {
            // Try to resolve by slug, name, or id
            let cat = null;
            if (mongoose.Types.ObjectId.isValid(category)) {
                cat = await Category.findById(category).lean();
            }
            if (!cat) {
                cat = await Category.findOne({
                    $or: [
                        { slug: category },
                        { name: new RegExp('^' + category + '$', 'i') }
                    ]
                }).lean();
            }
            if (cat) pageTitle = cat.name;
        } else if (q) {
            pageTitle = `Search: ${q}`;
        }

        res.render('user/store', {
            user: req.user,
            categories,
            products,
            currentPage,
            totalPages: Math.ceil(totalProducts / Number(limit)),
            totalProducts,
            filters: {
                category,
                minPrice,
                maxPrice,
                size: size?.join(',') || '',
                color: color?.join(',') || '',
                sort,
                limit: Number(limit),
                q: q || '',
                subcategory
            },
            cartItems: cart?.items || [],
            title: pageTitle
        });
    } catch (err) {
        console.error('Error fetching store data:', err);
        res.status(500).render('user/store', {
            user: req.user,
            categories: [],
            products: [],
            currentPage: 1,
            totalPages: 1,
            totalProducts: 0,
            filters: {},
            cartItems: [],
            title: 'Store'
        });
    }
});

router.get('/product/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findOne({ _id: productId, isActive: true })
            .populate('category')
            .lean();

        if (!product) {
            return res.status(404).render('user/product-details', {
                user: req.user || null,
                product: null,
                relatedProducts: [],
                category: null,
                categories: []
            });
        }

        // Helper function to convert color names to hex codes
        const getColorCode = (colorName) => {
            const colorMap = {
                'black': '#222',
                'red': '#C93A3E',
                'grey': '#E4E4E4',
                'blue': '#1E90FF',
                'green': '#2E8B57',
                'white': '#FFFFFF',
                'yellow': '#FFD700',
                'pink': '#FFC0CB',
                'purple': '#800080',
                'orange': '#FFA500',
                'brown': '#A52A2A'
            };
            return colorMap[colorName.toLowerCase()] || '#CCCCCC';
        };

        const categories = await Category.find({ isActive: true })
            .select('name imageUrl isActive subCategories')
            .lean();

        const category = product.category || null;

        let relatedProducts = [];
        if (product.subcategory) {
            const subcategoryId = typeof product.subcategory === 'object' && product.subcategory !== null
                ? product.subcategory._id || product.subcategory
                : product.subcategory;
            relatedProducts = await Product.find({
                _id: { $ne: product._id },
                subcategory: subcategoryId,
                isActive: true
            })
                .limit(10)
                .lean();
        } else if (category && category._id) {
            relatedProducts = await Product.find({
                _id: { $ne: product._id },
                category: category._id,
                isActive: true
            })
                .limit(10)
                .lean();
        }

        res.render('user/product-details', {
            user: req.user || null,
            product,
            relatedProducts,
            category,
            categories,
            getColorCode // Pass the helper function to the view
        });
    } catch (err) {
        console.error('Error fetching product details:', err);
        res.status(500).render('user/product-details', {
            user: req.user || null,
            product: null,
            relatedProducts: [],
            category: null,
            categories: []
        });
    }
});
router.get('/contact', async (req, res) => {
    const categories = await Category.find({ isActive: true })
        .select('name imageUrl isActive subCategories')
        .lean();
    res.render('user/contact', { user: req.user || null, categories });
});
router.get('/account',isUser, async (req, res) => {
    const categories = await Category.find({ isActive: true })
      .select('name imageUrl isActive subCategories')
      .lean();
  
    let orders = [];
    if (req.session.user) {
      orders = await Order.find({ user: req.session.user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
    }
  
    res.render('user/account', {
      user: req.session.user || null, // ← Pass session user to EJS
      categories,
      orders,
    });
  });
  

router.get('/orders', isUser, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const tab = req.query.tab || 'current';
        let statusFilter = {};

        if (tab === 'current') {
            statusFilter = {
                orderStatus: { $in: ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery'] }
            };
        } else if (tab === 'delivered') {
            statusFilter = { orderStatus: 'Delivered' };
        } else if (tab === 'cancelled') {
            statusFilter = { orderStatus: { $in: ['Cancelled', 'Returned'] } };
        }

        const { orders: allOrders, needsRefresh } = await getOrdersWithTracking(
            req.user._id, 
            { skip: 0, limit: 1000 } 
        );

        const filteredOrders = allOrders.filter(order => {
            if (tab === 'current') {
                return ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery'].includes(order.orderStatus);
            } else if (tab === 'delivered') {
                return order.orderStatus === 'Delivered';
            } else if (tab === 'cancelled') {
                return ['Cancelled', 'Returned'].includes(order.orderStatus);
            }
            return true;
        });

        const paginatedOrders = filteredOrders.slice(skip, skip + limit);

        const categories = await Category.find({ isActive: true }).lean();

        const formattedOrders = paginatedOrders.map(order => {
            const deliveryInfo = order.deliveryInfo || {};
            const trackingHistory = deliveryInfo.trackingHistory || [];
            
            return {
                ...order,
                orderDate: formatDate(order.createdAt),
                deliveryDate: deliveryInfo.estimatedDelivery 
                    ? formatDate(deliveryInfo.estimatedDelivery)
                    : 'Calculating...',
                latestTracking: trackingHistory.length 
                    ? trackingHistory[trackingHistory.length - 1]
                    : null,
                canCancel: ['Pending', 'Confirmed', 'Processing'].includes(order.orderStatus),
                canReturn: order.orderStatus === 'Delivered' && 
                    isWithinReturnPeriod(order.createdAt)
            };
        });

        const totalOrders = filteredOrders.length;
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('user/orders', {
            user: req.user,
            orders: formattedOrders,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            categories,
            needsRefresh, 
            selectedTab: tab
        });

    } catch (error) {
        console.error('Order fetch error:', error);
        res.status(500).render('error', { 
            message: 'Failed to load orders',
            error: req.app.get('env') === 'development' ? error : null
        });
    }
});

// Helper functions
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function isWithinReturnPeriod(orderDate) {
    const returnPeriodDays = 30;
    const returnDeadline = new Date(orderDate);
    returnDeadline.setDate(returnDeadline.getDate() + returnPeriodDays);
    return new Date() < returnDeadline;
}

// Get single order details
router.get('/orders/:id', isUser, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('items.product')
            .lean();
            
        if (!order || !order.user || order.user.toString() !== req.user._id.toString()) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const formattedOrder = {
            ...order,
            orderDate: order.createdAt
                ? new Date(order.createdAt).toLocaleString('en-IN')
                : 'Not available',
            deliveryDate: order.deliveryInfo?.estimatedDelivery
                ? new Date(order.deliveryInfo.estimatedDelivery).toLocaleDateString('en-IN')
                : 'Not available',
            trackingHistory: Array.isArray(order.deliveryInfo?.trackingHistory)
                ? order.deliveryInfo.trackingHistory.map(item => ({
                    ...item,
                    date: item.date
                        ? new Date(item.date).toLocaleString('en-IN')
                        : 'Not available'
                }))
                : []
        };

        res.json(formattedOrder);
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).json({ error: 'Failed to load order details' });
    }
});
router.get('/cart', async (req, res) => {
    try {
        let cart = null;
        if (req.user) {
            cart = await Cart.findOne({ user: req.user._id }).lean();
        }
        const categories = await Category.find({ isActive: true })
            .select('name imageUrl isActive subCategories')
            .lean();
            
        res.render('user/cart', {
            user: req.user || null, 
            categories, 
            cartItems: cart?.items || [],
            cartSubtotal: cart?.subtotal || 0,
            // Pass a flag indicating this is the cart page
            isCartPage: true
        });
    } catch (error) {
        res.render('user/home', {
            user: req.user || null,
            cartItems: [], 
            categories: []
        });
    }
});
router.get('/wishlist', async (req, res) => {
    try {
        const user = req.user;

        const categories = await Category.find({ isActive: true })
            .select('name imageUrl isActive subCategories')
            .lean();

        let wishlist = [];

        if (user) {
            const wishlistDoc = await Wishlist.findOne({ user: user._id })
                .populate({
                    path: 'items.product',
                    model: 'Product',
                    select: 'name price salePrice images hasColorVariants hasSizeVariants'
                })

                .lean();

            if (wishlistDoc && wishlistDoc.items) {
                wishlist = wishlistDoc.items.map(item => ({
                    ...item,
                    product: item.product || {},
                    selectedColor: item.selectedColor || null,
                    selectedSize: item.selectedSize || null
                }));
            }
        }

        res.render('user/wishlist', {
            user: user || null,
            categories,
            wishlist
        });
    } catch (err) {
        console.error('Error fetching wishlist:', err);
        res.status(500).send('Server error');
    }
});
router.get('/checkout', async (req, res) => {
    try {
    
      const categories = await Category.find({ isActive: true }).lean();
  
      let user = req.user;
   
      if (!user && req.session.user) {
        user = await User.findById(req.session.user._id);
        if (user) {
          req.user = user; 
        }
      }
  
      const addresses = user
        ? await Address.find({ user: user._id }).sort({ isDefault: -1 }).lean()
        : [];
  
      let cart = null;
  
      if (user) {
        cart = await Cart.findOne({ user: user._id }).populate('items.product');
        
        if (!cart) {
        
          cart = new Cart({ 
            user: user._id, 
            items: [],
            subtotal: 0,
            total: 0
          });
          await cart.save();
        }
      } else {
        // Guest user - get by session
        cart = await Cart.findOne({ sessionId: req.sessionID }).populate('items.product');
      }
  
      // 5️⃣ Handle empty cart
      if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        return res.render('user/checkout', {
          user: user || null,
          categories,
          addresses,
          cart: { items: [], subtotal: 0, total: 0, couponInfo: null },
          defaultAddress: addresses.find(a => a.isDefault) || null,
          selectedBillingAddress: req.query.billingAddressId || null,
          selectedShippingAddress: req.query.shippingAddressId || null,
          message: 'Your cart is empty'
        });
      }
  
      cart.items = cart.items.map(item => {
        const productData = item.product || {};
        
        // Calculate item-level discount
        let discountAmount = 0;
        let discountPercent = 0;
        
        if (productData.basePrice && productData.salePrice && productData.basePrice > productData.salePrice) {
          discountAmount = (productData.basePrice - productData.salePrice) * item.quantity;
          discountPercent = ((productData.basePrice - productData.salePrice) / productData.basePrice) * 100;
        }
        
        return {
          product: item.product,
          productName: item.productName || productData.name || 'Unnamed Product',
          productImage: item.productImage || (productData.images && productData.images[0]) || '',
          price: Number(item.price) || Number(productData.salePrice || productData.basePrice) || 0,
          quantity: Number(item.quantity) || 1,
          selectedColor: item.selectedColor || null,
          selectedSize: item.selectedSize || null,
          basePrice: Number(productData.basePrice) || Number(item.price) || 0,
          salePrice: Number(productData.salePrice) || Number(item.price) || 0,
          discountAmount: discountAmount,
          discountPercent: discountPercent
        };
      });

      if (cart.couponInfo && cart.couponInfo.validated) {
        cart.discountAmount = cart.couponInfo.discountAmount || 0;
      } else {
        cart.discountAmount = 0;
      }
  
      // 7️⃣ Recalculate totals
      if (typeof cart.recalculateTotals === 'function') {
        cart.recalculateTotals();
        await cart.save();
      } else {
        // Manual recalculation as fallback
        cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cart.total = cart.subtotal;
        await cart.save();
      }

 
  
      // 8️⃣ Render checkout page
      res.render('user/checkout', {
        user: user || null,
        categories,
        addresses,
        cart,
        defaultAddress: addresses.find(a => a.isDefault) || null,
        selectedBillingAddress: req.query.billingAddressId || null,
        selectedShippingAddress: req.query.shippingAddressId || null
      });
  
    } catch (error) {
      console.error('Checkout error:', error);
      res.status(500).render('error', {
        message: 'Error loading checkout page',
        error: process.env.NODE_ENV === 'development' ? error : null
      });
    }
});
// Add this route to remove coupon
router.post('/remove-coupon', async (req, res) => {
    try {
        let user = req.user;
        if (!user && req.session.user) {
            user = await User.findById(req.session.user._id);
            if (user) req.user = user;
        }

        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }

        // 🚨 FIX: Use findOneAndUpdate to avoid version conflicts
        const cart = await Cart.findOneAndUpdate(
            { user: user._id },
            { 
                $set: {
                    couponInfo: {
                        code: null,
                        discountType: null,
                        discountValue: 0,
                        discountAmount: 0,
                        validated: false,
                        minPurchase: 0
                    },
                    discountAmount: 0
                }
            },
            { new: true } // Return updated document
        );

        if (!cart) {
            return res.status(400).json({ success: false, message: 'Cart not found' });
        }

        // 🚨 FIX: Recalculate totals without saving (to avoid version conflicts)
        cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cart.total = cart.subtotal; // Total becomes same as subtotal
        
        // 🚨 FIX: Use findOneAndUpdate for the final save
        await Cart.findOneAndUpdate(
            { user: user._id },
            { 
                $set: {
                    subtotal: cart.subtotal,
                    total: cart.total
                }
            }
        );

        res.json({
            success: true,
            message: 'Coupon removed successfully'
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to remove coupon',
            error: error.message 
        });
    }
});
router.post('/apply-coupon', async (req, res) => {
    try {
        let user = req.user;
        if (!user && req.session.user) {
            user = await User.findById(req.session.user._id);
            if (user) {
                req.user = user;
            }
        }

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'User not found. Please refresh the page.' 
            });
        }

        // 1. Find the cart - ONLY by user ID for authenticated users
        let cart;
        if (user) {
            cart = await Cart.findOne({ user: user._id });
        } else {
            cart = await Cart.findOne({ sessionId: req.sessionID });
        }

        if (!cart) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cart not found',
                debug: { user: user?._id, hasUser: !!user }
            });
        }

        if (!cart.items || cart.items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cart is empty' 
            });
        }

        const { couponCode } = req.body;

        // 2. Check if coupon already applied
        if (cart.couponInfo && cart.couponInfo.code === couponCode.toUpperCase()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Coupon already applied to the cart' 
            });
        }

        // 3. Validate coupon
        const now = new Date();
        const coupon = await Coupon.findOne({
            code: couponCode.toUpperCase(),
            isActive: true,
            validFrom: { $lte: now },
            validUntil: { $gte: now },
            $or: [
                { maxUses: null },
                { $expr: { $lt: ["$usedCount", "$maxUses"] } }
            ]
        }).populate('applicableCategories');

        if (!coupon) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired coupon' 
            });
        }

        // 4. Check if user already used the coupon
        if (user && coupon.usedBy.includes(user._id)) {
            return res.status(400).json({
                success: false,
                message: 'You have already used this coupon'
            });
        }

        // 5. Fetch products in cart
        const cartProducts = await Product.find({
            _id: { $in: cart.items.map(item => item.product) }
        }).populate('category');

        // 6. Calculate subtotal and apply coupon if valid
        let subtotal = 0;
        let applicableSubtotal = 0;
        let hasApplicableItems = false;

        for (const item of cart.items) {
            const product = cartProducts.find(p => p._id.equals(item.product));
            if (!product) continue;

            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;

            let isApplicable = false;

            // Scope: all
            if (coupon.scopeType === 'all') {
                isApplicable = true;
            }

            // Scope: categories
            else if (coupon.scopeType === 'categories' && coupon.applicableCategories.length > 0) {
                isApplicable = coupon.applicableCategories.some(cat =>
                    cat._id.equals(product.category._id || product.category)
                );
            }

            // Scope: subcategories (embedded in Category model)
            else if (coupon.scopeType === 'subcategories' && coupon.applicableSubcategories.length > 0) {
                const parentCategory = await Category.findOne({
                    'subCategories._id': { $in: coupon.applicableSubcategories }
                });

                if (parentCategory && product.category.equals(parentCategory._id)) {
                    const matchedSub = parentCategory.subCategories.find(sub =>
                        coupon.applicableSubcategories.some(id => id.equals(sub._id))
                    );

                    if (matchedSub) {
                        isApplicable = true;
                    }
                }
            }

            // Accumulate applicable subtotal
            if (isApplicable) {
                applicableSubtotal += itemTotal;
                hasApplicableItems = true;
            }
        }

        // 7. Check min purchase
        const minPurchaseCheckValue = coupon.scopeType === 'all' ? subtotal : applicableSubtotal;

        if (minPurchaseCheckValue < coupon.minPurchase) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minPurchase} required` +
                    (coupon.scopeType !== 'all' ? ' for applicable items' : '')
            });
        }

        // 8. Ensure at least one matching product
        if (coupon.scopeType !== 'all' && !hasApplicableItems) {
            return res.status(400).json({
                success: false,
                message: 'Coupon is not applicable to any products in your cart'
            });
        }

        // 9. Calculate discount
        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = (coupon.scopeType === 'all' ? subtotal : applicableSubtotal) * (coupon.value / 100);
        } else if (coupon.discountType === 'fixed') {
            discountAmount = Math.min(
                coupon.value,
                coupon.scopeType === 'all' ? subtotal : applicableSubtotal
            );
        }

        // 10. Update cart
        cart.couponInfo = {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.value,
            discountAmount: discountAmount,
            minPurchase: coupon.minPurchase,
            validated: true,
            scopeType: coupon.scopeType,
            applicableCategories: coupon.applicableCategories,
            applicableSubcategories: coupon.applicableSubcategories
        };

        cart.subtotal = subtotal;
        cart.total = subtotal - discountAmount;

        await cart.save();

        return res.json({
            success: true,
            cart: cart.toObject(),
            message: 'Coupon applied successfully'
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to apply coupon' 
        });
    }
});
  

router.post('/place-order', async (req, res) => {
    try {
        const { billingAddressId, shippingAddressId, totalAmount, paymentMethod, notes } = req.body;

        // Ensure we have the correct user (same as checkout route)
        let user = req.user;
        if (!user && req.session.user) {
            user = await User.findById(req.session.user._id);
            if (user) {
                req.user = user;
            }
        }

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'User not found. Please refresh the page.' 
            });
        }

        // Validate input
        if (!billingAddressId || !shippingAddressId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing billing or shipping address ID' 
            });
        }

        // Get cart - ONLY by user ID for authenticated users
        const cart = await Cart.findOne({ user: user._id });

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cart is empty',
                debug: {
                    user: user._id,
                    hasCart: !!cart,
                    itemsCount: cart?.items?.length || 0
                }
            });
        }

        // Use cart total instead of passed totalAmount for consistency
        const orderTotal = cart.total;

        // Get addresses
        const [billingAddr, shippingAddr] = await Promise.all([
            Address.findById(billingAddressId).lean(),
            Address.findById(shippingAddressId).lean()
        ]);

        if (!billingAddr || !shippingAddr) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid address data' 
            });
        }

        const userEmail = user.email;
        const userName = user.name || 'there';

        // COD order
        if (paymentMethod === 'COD') {
            // NO order creation OR cart clearing here – will be handled in /confirm-order

            // Send confirmation/ack email (optional: only info, NOT an invoice)
            if (userEmail) {
                try {
                    const transporter = nodemailer.createTransport({
                        service: 'gmail',
                        auth: { user: process.env.EMAIL_USERNAME, pass: process.env.EMAIL_PASSWORD }
                    });

                    const mailOptions = {
                        from: process.env.EMAIL_USERNAME,
                        to: userEmail,
                        subject: `Your COD Order is being processed at StayRare!`,
                        html: `
                            <div style="font-family:Arial,sans-serif;font-size:16px;max-width:500px;margin:0 auto;background:#fff;padding:28px;border-radius:8px;color:#222;">
                                <h2 style="color:#7c3aed;margin-bottom:0.5em;">Thank you for shopping with StayRare, ${userName}!</h2>
                                <p>Your Cash on Delivery (COD) order is being processed.<br>
                                Please complete confirmation to finalize your purchase.</p>
                                <hr style="margin:1.5em 0;">
                                <p>Want to shop more? <a href="https://stayrare.in/store" style="color:#7c3aed;text-decoration:underline;">Browse our best deals and new arrivals!</a></p>
                                <p>Thanks for shopping with us!<br><b>Team StayRare</b></p>
                            </div>
                        `
                    };

                    transporter.sendMail(mailOptions, (err) => {
                        if (err) console.error('Failed to send COD initiation email:', err);
                    });
                } catch (e) {
                    console.error('COD order email error:', e);
                }
            }

            // Only acknowledge, do not create order or clear cart
            return res.json({ 
                success: true, 
                cod: true, 
                message: 'COD order initiation successful. Please confirm to place order.'
            });
        }

        // Online payment (Razorpay)
        const options = {
            amount: Math.round(cart.total * 100), // Use cart.total
            currency: "INR",
            receipt: `order_rcptid_${Date.now()}`
        };

        if (!razorpayInstance) {
            return res.status(500).json({ 
                success: false, 
                message: 'Payment gateway not configured' 
            });
        }

        const razorpayOrder = await razorpayInstance.orders.create(options);

        // Store pending order in session
        req.session.pendingOrder = {
            cartItems: cart.items,
            billingAddress: billingAddr,
            shippingAddress: shippingAddr,
            subtotal: cart.subtotal,
            discountAmount: cart.discountAmount || 0,
            totalAmount: cart.total,
            notes: notes || '',
            razorpayOrderId: razorpayOrder.id
        };

        // Send email to notify user about order started
        if (userEmail) {
            try {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: process.env.EMAIL_USERNAME, pass: process.env.EMAIL_PASSWORD }
                });

                const mailOptions = {
                    from: process.env.EMAIL_USERNAME,
                    to: userEmail,
                    subject: `Your StayRare Order is in Process`,
                    html: `
                        <div style="font-family:Arial,sans-serif;font-size:16px;max-width:500px;margin:0 auto;background:#fff;padding:28px;border-radius:8px;color:#222;">
                            <h2 style="color:#7c3aed;margin-bottom:0.5em;">Hi ${userName},</h2>
                            <p>You've chosen online payment. After successful payment, your order will be confirmed and processed immediately.</p>
                            <p>We'll notify you when your order is shipped — with tracking for smooth delivery!</p>
                            <hr style="margin:1.5em 0;">
                            <p>Excited for your new StayRare purchase? <a href="https://stayrare.in/store" style="color:#7c3aed;text-decoration:underline;">Check out more great styles!</a></p>
                            <p>Thanks for trusting us!<br><b>Team StayRare</b></p>
                        </div>
                    `
                };

                transporter.sendMail(mailOptions, (err) => {
                    if (err) console.error('Failed to send online order email:', err);
                });
            } catch (e) {
                console.error('Online order email error:', e);
            }
        }

        // Return Razorpay details to frontend
        res.json({
            success: true,
            cod: false,
            razorpayOrderId: razorpayOrder.id,
            amount: options.amount,
            currency: options.currency,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Place order error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to place order', 
            error: error.message 
        });
    }
});


router.post('/confirm-order', async (req, res) => {
    try {
        const {
            paymentMethod,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            billingAddressId,
            shippingAddressId,
            notes // Allow notes to be passed for COD, if any
        } = req.body;

        const userId = req.user?._id;
        const sessionId = req.sessionID;
        const cart = await Cart.findOne(userId ? { user: userId } : { sessionId });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        const [billingAddress, shippingAddress] = await Promise.all([
            Address.findById(billingAddressId).lean(),
            Address.findById(shippingAddressId).lean()
        ]);

        if (!billingAddress || !shippingAddress) {
            return res.status(400).json({ success: false, message: 'Invalid addresses' });
        }

        let paymentStatus = 'Pending';
        let paymentMethodToSave = paymentMethod; 
        if (paymentMethod !== 'COD') {
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex');

            if (expectedSignature !== razorpay_signature) {
                return res.status(400).json({ success: false, message: 'Invalid payment signature' });
            }

            paymentStatus = 'Paid';
            paymentMethodToSave = 'Razorpay';
        } else {
            // Explicitly set paymentMethod as 'COD' for the order document
            paymentMethodToSave = 'COD';
        }

        // ✅ Create order
        const newOrder = new Order({
            user: userId,
            items: cart.items.map(item => ({
                product: item.product,
                name: item.productName,
                selectedColor: item.selectedColor,
                selectedSize: item.selectedSize,
                quantity: item.quantity,
                price: item.price * item.quantity,
                weight: item.weight || 0.5
            })),
            billingAddress,
            shippingAddress,
            couponUsed: cart.couponInfo?.validated ? {
                code: cart.couponInfo.code,
                discountType: cart.couponInfo.discountType,
                discountValue: cart.couponInfo.discountValue,
                discountAmount: cart.couponInfo.discountAmount || (cart.subtotal - cart.total),
                couponId: cart.couponInfo.couponId
            } : undefined,
            totalAmount: cart.total,
            paymentInfo: {
                method: paymentMethodToSave,
                razorpayPaymentId: paymentMethodToSave === 'COD' ? null : razorpay_payment_id,
                razorpayOrderId: paymentMethodToSave === 'COD' ? null : razorpay_order_id,
                status: paymentStatus
            },
            notes: notes || '', // Set notes if present
            deliveryInfo: {
                status: 'Processing',
                updatedAt: new Date()
            },
            orderStatus: 'Confirmed'
        });

        await newOrder.save();

        try {
            const srOrder = await shiprocketService.createOrder(newOrder, shippingAddress, paymentMethodToSave);
            newOrder.deliveryInfo.shipmentId = srOrder.shipment_id;
            newOrder.deliveryInfo.trackingId = srOrder.order_id;
            await newOrder.save();
        } catch (err) {
            console.error('Shiprocket Error:', err.message);
        }

        try {
            let recipientEmail = req.user?.email || billingAddress?.email || shippingAddress?.email;
            if (recipientEmail) await sendInvoiceEmail(newOrder.toObject(), recipientEmail);
        } catch (emailError) {
            console.error("Invoice mail failed:", emailError.message);
        }

        // ✅ Clear cart (only after order is created)
        cart.items = [];
        cart.subtotal = 0;
        cart.total = 0;
        cart.couponInfo = {};
        cart.discountAmount = 0;
        await cart.save();

        res.json({
            success: true,
            orderId: newOrder._id,
            paymentMethod: paymentMethodToSave,
            message: paymentMethodToSave === 'COD' ? 'Order placed successfully (COD)' : 'Order confirmed'
        });

    } catch (error) {
        console.error('Order confirmation failed:', error.message);
        res.status(500).json({ success: false, message: 'Order processing failed', error: error.message });
    }
});

async function reduceCategoryStock(orderId) {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const order = await Order.findById(orderId)
        .populate("items.product")
        .session(session);
  
      if (!order) throw new Error("Order not found");
  
      for (const item of order.items) {
        const orderedProduct = item.product;
  
        // Find all products in the same category
        const categoryProducts = await Product.find({
          category: orderedProduct.category,
        }).session(session);
  
        for (const prod of categoryProducts) {
          // Base stock reduce
          if (prod.stock >= item.quantity) {
            prod.stock -= item.quantity;
          } else {
            throw new Error(
              `Insufficient stock for product ${prod.name} in category`
            );
          }
  
          // If product has color variants
          if (prod.hasColorVariants && prod.colorVariants?.length > 0) {
            prod.colorVariants = prod.colorVariants.map((cv) => {
              if (cv.color === item.selectedColor) {
                if (cv.stock < item.quantity) {
                  throw new Error(
                    `Not enough stock in color ${cv.color} of ${prod.name}`
                  );
                }
                cv.stock -= item.quantity;
              }
              return cv;
            });
          }
  
          // If product has size variants
          if (prod.hasSizeVariants && prod.sizeVariants?.length > 0) {
            prod.sizeVariants = prod.sizeVariants.map((sv) => {
              if (sv.size === item.selectedSize) {
                if (sv.stock < item.quantity) {
                  throw new Error(
                    `Not enough stock in size ${sv.size} of ${prod.name}`
                  );
                }
                sv.stock -= item.quantity;
              }
              return sv;
            });
          }
  
          await prod.save({ session });
        }
      }
  
      await session.commitTransaction();
      session.endSession();
      console.log("✅ Stock updated for all products in categories");
  
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("❌ Stock update failed:", err.message);
      throw err;
    }
  }
  

  
  router.get('/order-confirmation/:orderId', async (req, res) => {
    try {
      const orderId = req.params.orderId;
  
      try {
        await reduceCategoryStock(orderId);
      } catch (stockErr) {
        console.error("Stock update failed:", stockErr.message);
        return res.status(400).render('error', { message: 'Stock update failed. Please contact support.' });
      }
  
      const order = await Order.findById(orderId)
        .populate('items.product')
        .populate('user')
        .lean();
  
      if (!order) {
        return res.status(404).render('error', { message: 'Order not found' });
      }
  
      if (order.user && order.user._id) {
        await sendNotificationToUser(
          order.user._id,
          "Order Confirmed ✅",
          `Your order #${order._id} has been confirmed!`,
          `/orders/${order._id}`
        );
      }
  
      const categories = await Category.find({ isActive: true })
        .select('name imageUrl isActive subCategories')
        .lean();
  
      res.render('user/order-confirmation', {
        user: req.user || null,
        order,
        categories
      });
    } catch (err) {
      console.error("Error loading order confirmation:", err);
      res.status(500).render('error', { message: 'Failed to load order confirmation' });
    }
  });
  

  router.post("/subscribe", async (req, res) => {
    try {
      const subscription = req.body;
  
      if (req.user) {
        await Subscription.findOneAndUpdate(
          { user: req.user._id },
          { subscription },
          { upsert: true, new: true }
        );
      } else {
        await Subscription.create({ subscription });
      }
  
      res.status(201).json({ message: "Subscribed!" });
    } catch (err) {
      console.error("Subscription error:", err);
      res.status(500).json({ message: "Failed to subscribe" });
    }
  });
  

router.get('/privacy_policy', async (req, res) => {
    const categories = await Category.find({ isActive: true })
        .select('name imageUrl isActive subCategories')
        .lean();
    res.render('user/privacy', { user: req.user || null, categories });
});
router.get('/shipping_policy', async (req, res) => {
    const categories = await Category.find({ isActive: true })
        .select('name imageUrl isActive subCategories')
        .lean();
    res.render('user/shipping-policy', { user: req.user || null, categories });
});
router.get('/return_policy', async (req, res) => {
    const categories = await Category.find({ isActive: true })
        .select('name imageUrl isActive subCategories')
        .lean();
    res.render('user/return-policy', { user: req.user || null, categories });
});

router.get('/terms_and_conditions', async (req, res) => {
    const categories = await Category.find({ isActive: true })
        .select('name imageUrl isActive subCategories')
        .lean();
    res.render('user/terms-conditions', { user: req.user || null, categories });
});
router.get('/blogs', async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true })
            .select('name imageUrl isActive subCategories')
            .lean();

        let page = parseInt(req.query.page) || 1;
        let limit = 6;
        let skip = (page - 1) * limit;

        const totalBlogs = await Blog.countDocuments();
        const totalPages = Math.ceil(totalBlogs / limit);

        const blogs = await Blog.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.render('user/blogs', {
            user: req.user || null,
            categories,
            blogs,
            currentPage: page,
            totalPages
        });
    } catch (err) {
        console.error("Error loading blogs:", err);
        res.status(500).render('error', { message: 'Failed to load blogs' });
    }
});
router.get('/blogs/:id', async (req, res) => {
    try {
        const categories = await Category.find()
            .select('name imageUrl isActive subCategories')
            .lean();

        const blog = await Blog.findById(req.params.id).lean();

        if (!blog) {
            return res.status(404).render('error', { message: 'Blog not found' });
        }

        const relatedBlogs = await Blog.find({ _id: { $ne: req.params.id } })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        res.render('user/blogDetails', { 
            user: req.user || null, 
            categories, 
            blog, 
            relatedBlogs 
        });
    } catch (err) {
        console.error("Error loading blog details:", err);
        res.status(500).render('error', { message: 'Failed to load blog details' });
    }
});

router.post('/orders/:orderId/cancel', orderController.cancelOrder);

// Replacement request
router.post('/orders/replace', orderController.requestReplacement);

cron.schedule("0 0 * * *", async () => {
    const abandonedCarts = await Cart.find({ checkedOut: false });
    if (abandonedCarts.length > 0) {
      await sendNotificationToAllUsers(
        "You left items in your cart 🛒",
        "Complete your purchase before stock runs out!",
        "/cart"
      );
    }
  });
  
  module.exports = router;
