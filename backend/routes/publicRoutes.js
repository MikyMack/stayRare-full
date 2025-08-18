const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const crypto = require('crypto');
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
const Testimonial = require('../models/Testimonial');
const { createEmptyCart, validateCartCoupon } = require('../utils/cartUtils');
const isUser = require('../middleware/isUser');
const razorpayInstance = require('../utils/razorpay');
const sendInvoiceEmail = require("../utils/sendInvoice");

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
        const dealsOfTheDay = shuffleArray(dealsOfTheDayRaw).slice(0, 2); // You confirmed this works

        const blogs = await Blog.find().sort({ createdAt: -1 }).limit(5).lean().catch(() => []);

        const activeCoupons = await Coupon.find({
            isActive: true,
            validUntil: { $gte: new Date() }
        }).select('code description').lean();

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
            wishlistCount
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
            wishlistCount: 0
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
            limit = 16,
            category,
            minPrice,
            maxPrice,
            size,
            color,
            sort = 'newest', 
            q,
            subcategory,
            categoryPage = 1,
            subcategoryPage = 1
        } = req.query;

        if (size) size = Array.isArray(size) ? size : size.split(',').filter(s => s.trim());
        if (color) color = Array.isArray(color) ? color : color.split(',').filter(c => c.trim());

        let filter = { isActive: true };
        let useSubcategoryPagination = false;
        let useCategoryPagination = false;

        const specialNewArrivalsCategory = "68401f815a149404380fc58f";
        const specialNewArrivalsSubcategory = "684020345a149404380fc594";
        const specialBestDealsCategory = "684023da5a149404380fc640";

        let isSpecialNewArrivals = false;
        let isSpecialBestDeals = false;

        if (subcategory && mongoose.Types.ObjectId.isValid(subcategory)) {
            if (subcategory === specialNewArrivalsSubcategory) {
                isSpecialNewArrivals = true;
            } else {
                filter.subcategory = subcategory;
                useSubcategoryPagination = true;
            }
        }

        if (category) {
            let decodedCategory = decodeURIComponent(category);

            if (category === specialNewArrivalsCategory) {
                isSpecialNewArrivals = true;
            } else if (category === specialBestDealsCategory) {
                isSpecialBestDeals = true;
            } else {
                const foundCategory = await Category.findOne({
                    $or: [
                        { slug: decodedCategory },
                        { name: new RegExp('^' + decodedCategory + '$', 'i') }
                    ]
                }).lean();

                if (foundCategory) {
                    filter.category = foundCategory._id;
                    useCategoryPagination = true;
                } else if (mongoose.Types.ObjectId.isValid(category)) {
                    filter.category = category;
                    useCategoryPagination = true;
                }
            }
        }

        if (isSpecialNewArrivals) {
            filter = { isActive: true, newArrivals: true };
            useCategoryPagination = false;
            useSubcategoryPagination = false;
        } else if (isSpecialBestDeals) {
            filter = { isActive: true, bestDeals: true };
            useCategoryPagination = false;
            useSubcategoryPagination = false;
        }

        let effectivePage = Number(page) || 1;
        let currentPage = effectivePage;

        if (!isSpecialNewArrivals && !isSpecialBestDeals) {
            if (useSubcategoryPagination) {
                effectivePage = Number(subcategoryPage) || 1;
                currentPage = effectivePage;
            } else if (useCategoryPagination) {
                effectivePage = Number(categoryPage) || 1;
                currentPage = effectivePage;
            }
        }

        if (q && typeof q === 'string' && q.trim()) {
            const keywords = q.trim().split(/\s+/).join('|'); // e.g. "leather boots" → "leather|boots"
            const searchRegex = new RegExp(keywords, 'i');
        
            const matchedCategories = await Category.find({
                $or: [
                    { 'subCategories.name': searchRegex }
                ]
            }).lean();
        
            const subcategoryIds = matchedCategories.flatMap(cat =>
                (cat.subCategories || []).filter(sub => searchRegex.test(sub.name)).map(sub => sub._id.toString())
            );
        
            // Combine full filter
            filter.$or = [
                { name: searchRegex },
                { description: searchRegex },
                { moreDetails: searchRegex },
                { 'productDetails.productType': searchRegex },
                { 'productDetails.brand': searchRegex },
                { 'productDetails.productCollection': searchRegex },
                { subcategory: { $in: subcategoryIds } }
            ];
        
            effectivePage = Number(page) || 1;
            currentPage = effectivePage;
        }
        
        if (minPrice || maxPrice) {
            const priceFilter = {};
            if (minPrice) priceFilter.$gte = Number(minPrice);
            if (maxPrice) priceFilter.$lte = Number(maxPrice);

            filter.$and = filter.$and || [];
            filter.$and.push({
                $or: [
                    { 
                        $and: [
                            { $or: [{ salePrice: { $gt: 0 } }, { salePrice: { $exists: true } }] },
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

        // Sorting logic for price-low and price-high
        let sortObj = {};
        switch (sort) {
            case 'price-low':
                // Sort by effective price: salePrice if > 0, else basePrice
                // This requires aggregation, but for .find() we can sort by a computed field in-memory after fetching
                sortObj = { };
                break;
            case 'price-high':
                sortObj = { };
                break;
            case 'bestseller':
                sortObj = { soldCount: -1 };
                break;
            default:
                sortObj = { createdAt: -1 };
        }

        let products = [];
        if (sort === 'price-low' || sort === 'price-high') {

            let fetchedProducts = await Product.find(filter)
                .skip((effectivePage - 1) * Number(limit))
                .limit(Number(limit))
                .lean();

            if (fetchedProducts.length < Number(limit)) {
                fetchedProducts = await Product.find(filter).lean();
            }


            fetchedProducts.forEach(p => {
                p.effectivePrice = (p.salePrice && p.salePrice > 0) ? p.salePrice : p.basePrice;
            });

            fetchedProducts.sort((a, b) => {
                if (sort === 'price-low') {
                    return a.effectivePrice - b.effectivePrice;
                } else {
                    return b.effectivePrice - a.effectivePrice;
                }
            });

            // Paginate after sort
            products = fetchedProducts.slice((effectivePage - 1) * Number(limit), effectivePage * Number(limit));
        } else {
            products = await Product.find(filter)
                .skip((effectivePage - 1) * Number(limit))
                .limit(Number(limit))
                .sort(sortObj)
                .lean();
        }

        const categories = await Category.find({}).lean();
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
            const cat = await Category.findOne({
                $or: [
                    { slug: category },
                    { name: new RegExp('^' + category + '$', 'i') }
                ]
            }).lean();
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
                subcategory,
                categoryPage: useCategoryPagination ? currentPage : 1,
                subcategoryPage: useSubcategoryPagination ? currentPage : 1
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
            categories
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
            user: req.user || null, categories, cartItems: cart?.items || [],
            cartSubtotal: cart?.subtotal || 0
        });
    } catch (error) {
        res.render('user/home', {
            user: req.user || null,
            cartItems: [], categories: []
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
    const addresses = req.user
      ? await Address.find({ user: req.user._id }).sort({ isDefault: -1 }).lean()
      : [];

    let cart = req.user
      ? await Cart.findOne({ user: req.user._id }).lean()
      : await Cart.findOne({ sessionId: req.sessionID }).lean();

    cart = cart ? await validateCartCoupon(cart) : createEmptyCart();

    // 🔄 Fetch product pricing for each cart item
    const productMap = {};
    const productIds = cart.items.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } }).select('basePrice salePrice name').lean();
    products.forEach(prod => productMap[prod._id] = prod);

    // 💡 Attach product price info to each cart item
    cart.items = cart.items.map(item => {
      const prod = productMap[item.product];
      const base = prod?.basePrice || item.price;
      const sale = prod?.salePrice > 0 && prod?.salePrice < base ? prod.salePrice : base;
      const discountAmount = base - sale;
      const discountPercent = base > sale ? Math.round((discountAmount / base) * 100) : 0;

      return {
        ...item,
        basePrice: base,
        salePrice: sale,
        discountAmount,
        discountPercent
      };
    });

    res.render('user/checkout', {
      user: req.user || null,
      categories,
      addresses,
      cart,
      defaultAddress: addresses.find(addr => addr.isDefault) || null,
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

router.post('/apply-coupon', async (req, res) => {
    try {
      const { couponCode } = req.body;
  
      // 1. Find the cart
      let cart;
      if (req.user) {
        cart = await Cart.findOne({ user: req.user._id });
      } else {
        cart = await Cart.findOne({ sessionId: req.sessionID });
      }
  
      if (!cart) {
        return res.status(400).json({ success: false, message: 'Cart not found' });
      }
  
      // 2. Check if coupon already applied
      if (cart.couponInfo && cart.couponInfo.code === couponCode.toUpperCase()) {
        return res.status(400).json({ success: false, message: 'Coupon already applied to the cart' });
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
        return res.status(400).json({ success: false, message: 'Invalid or expired coupon' });
      }
  
      // 4. Check if user already used the coupon
      if (req.user && coupon.usedBy.includes(req.user._id)) {
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
  
      // 11. Update coupon usage
      if (req.user) {
        coupon.usedBy.push(req.user._id);
        coupon.usedCount += 1;
        await coupon.save();
      }
  
      return res.json({
        success: true,
        cart: cart.toObject(),
        message: 'Coupon applied successfully'
      });
  
    } catch (error) {
      console.error('Error applying coupon:', error);
      return res.status(500).json({ success: false, message: 'Failed to apply coupon' });
    }
  });
  

router.post('/place-order', async (req, res) => {
    try {

        const { billingAddressId, shippingAddressId, totalAmount } = req.body;

        // Validate address IDs
        if (!billingAddressId || !shippingAddressId) {
            return res.status(400).json({
                success: false,
                message: 'Missing billing or shipping address ID'
            });
        }

        // Validate total amount
        if (!totalAmount || typeof totalAmount !== 'number' || totalAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid total amount'
            });
        }

        const options = {
            amount: Math.round(totalAmount * 100), // Razorpay needs amount in paise
            currency: "INR",
            receipt: `order_rcptid_${Date.now()}`
        };

        // Ensure Razorpay is configured
        if (!razorpayInstance) {
            console.error('Razorpay instance not initialized');
            return res.status(500).json({
                success: false,
                message: 'Payment gateway not configured'
            });
        }

        // Create order
        const razorpayOrder = await razorpayInstance.orders.create(options);
        res.json({
            success: true,
            razorpayOrderId: razorpayOrder.id,
            amount: options.amount,
            currency: options.currency,
            key: process.env.RAZORPAY_KEY_ID || 'key_not_loaded'
        });

    } catch (error) {
        console.error('Error in /place-order:', error);

        if (error.error) {
            console.error('Razorpay error details:', error.error);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

router.post('/confirm-order', async (req, res) => {

    try {
        // Validate payment
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, billingAddressId, shippingAddressId } = req.body;

        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // Get user and cart
        const userId = req.user?._id;
        const sessionId = req.sessionID;
        const cart = await Cart.findOne(userId ? { user: userId } : { sessionId });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Get addresses
        const [billingAddress, shippingAddress] = await Promise.all([
            Address.findById(billingAddressId).lean(),
            Address.findById(shippingAddressId).lean()
        ]);

        if (!billingAddress || !shippingAddress) {
            return res.status(400).json({ success: false, message: 'Invalid addresses' });
        }

        // Create order document
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
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
                status: 'Paid'
            },
            deliveryInfo: {
                status: 'Processing',
                updatedAt: new Date()
            },
            orderStatus: 'Confirmed'
        });

        // Save initial order state
        await newOrder.save();

        // Shiprocket integration
        let shipmentResponse = {};
        try {
            // 1. Create Shiprocket order
            const srOrder = await shiprocketService.createOrder(newOrder, shippingAddress);
            newOrder.deliveryInfo.shipmentId = srOrder.shipment_id;
            newOrder.deliveryInfo.trackingId = srOrder.order_id;
            await newOrder.save();

            // 2. Assign AWB
            const safeShippingAddress = newOrder.shippingAddress || newOrder.billingAddress;
            const awbRes = await shiprocketService.assignAWB(
                srOrder.shipment_id,
                safeShippingAddress,
                newOrder.items
            );

            newOrder.deliveryInfo.awbCode = awbRes.awb_code;
            newOrder.deliveryInfo.courier = awbRes.courier_name || 'Shiprocket';
            await newOrder.save();

            // 3. Generate Pickup
            const pickupResult = await shiprocketService.generatePickup(srOrder.shipment_id);
            newOrder.deliveryInfo.pickupStatus = pickupResult.message || 'Pickup generated';

            // 4. Get label with retries - using only documented endpoint
            try {
                const labelRes = await shiprocketService.generateLabel(srOrder.shipment_id);
                newOrder.deliveryInfo.labelUrl = labelRes.label_url;
                newOrder.deliveryInfo.status = 'Processing';
                newOrder.orderStatus = 'Processing';
            } catch (labelError) {
                console.error('Automatic label generation failed:', labelError.message);
                newOrder.deliveryInfo.status = 'Processing';
                newOrder.deliveryInfo.error = labelError.message;
                newOrder.orderStatus = 'Processing';
            }

            await newOrder.save();

            shipmentResponse = {
                shipmentId: newOrder.deliveryInfo.shipmentId,
                awbCode: newOrder.deliveryInfo.awbCode,
                labelUrl: newOrder.deliveryInfo.labelUrl,
                trackingId: newOrder.deliveryInfo.trackingId,
                status: newOrder.deliveryInfo.status
            };

        } catch (shipmentError) {
            newOrder.deliveryInfo = {
                ...newOrder.deliveryInfo,
                status: 'Failed',
                error: shipmentError.message,
                updatedAt: new Date()
            };
            newOrder.orderStatus = 'Processing';
            console.error('Shipment processing failed:', {
                orderId: newOrder._id,
                error: shipmentError.message,
                stack: shipmentError.stack
            });
        }

        await newOrder.save();

        // Send invoice email
        if (userId && req.user?.email) {
            try {
                await sendInvoiceEmail(newOrder.toObject(), req.user.email);
            } catch (emailError) {
                console.error('Failed to send invoice:', emailError.message);
            }
        }

        // Update coupon usage
        if (userId && cart.couponInfo?.validated && cart.couponInfo?.code) {
            try {
                await Coupon.findOneAndUpdate(
                    { code: cart.couponInfo.code },
                    { $inc: { usedCount: 1 }, $addToSet: { usedBy: userId } }
                );
            } catch (couponError) {
                console.error('Coupon update failed:', couponError.message);
            }
        }

        // Clear cart
        cart.items = [];
        cart.subtotal = 0;
        cart.total = 0;
        cart.couponInfo = {};
        await cart.save();

        res.json({
            success: true,
            orderId: newOrder._id,
            ...(Object.keys(shipmentResponse).length > 0 && { shiprocket: shipmentResponse })
        });

    } catch (error) {
        console.error('Order confirmation failed:', {
            message: error.message,
            stack: error.stack,
            userId: req.user?._id
        });
        res.status(500).json({
            success: false,
            message: 'Order processing failed',
            error: error.message
        });
    }
});

router.get('/order-confirmation/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;

        const order = await Order.findById(orderId)
            .populate('items.product')
            .populate('user')
            .lean();

        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }
        const categories = await Category.find({ isActive: true })
            .select('name imageUrl isActive subCategories')
            .lean();

        res.render('user/order-confirmation', {
            user: req.user || null,
            order, categories
        });
    } catch (err) {
        console.error("Error loading order confirmation:", err);
        res.status(500).render('error', { message: 'Failed to load order confirmation' });
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
router.get('/Cancellation_Refund', async (req, res) => {
    const categories = await Category.find({ isActive: true })
        .select('name imageUrl isActive subCategories')
        .lean();
    res.render('user/cancellation-refund', { user: req.user || null, categories });
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

module.exports = router;
