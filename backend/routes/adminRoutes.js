const express = require('express');
const router = express.Router();
const moment = require('moment')
const isAdmin = require('../middleware/isAdmin');
const productController = require('../controllers/productController');
const { multerUpload } = require('../middleware/uploadS3');  
const Category = require('../models/Category');
const Product = require('../models/Product');
const Coupons = require('../models/Coupon');
const Order = require('../models/Order');
const User = require('../models/User');



router.get('/admin/login', (req, res) => {
  res.render('admin/admin-login', {
    title: 'Admin Login',
    user: req.session.user || null
  });
});

router.get('/admin/dashboard', isAdmin, async (req, res) => {
    try {
        // Get time period from query params (default to weekly)
        const timePeriod = req.query.period || 'weekly';
        
        // Calculate date ranges based on time period
        let startDate = new Date();
        switch(timePeriod) {
            case 'monthly':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'yearly':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default: // weekly
                startDate.setDate(startDate.getDate() - 7);
        }

        // Get counts for dashboard cards with growth percentages
        const [currentPeriodData, previousPeriodData] = await Promise.all([
            // Current period data
            Promise.all([
                Order.aggregate([
                    { $match: { 
                        'paymentInfo.status': 'Paid',
                        createdAt: { $gte: startDate }
                    } },
                    { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
                ]),
                Order.countDocuments({ createdAt: { $gte: startDate } }),
                User.countDocuments({ 
                    role: 'user',
                    createdAt: { $gte: startDate }
                })
            ]),
            // Previous period data (for comparison)
            Promise.all([
                Order.aggregate([
                    { $match: { 
                        'paymentInfo.status': 'Paid',
                        createdAt: { $lt: startDate }
                    } },
                    { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
                ]),
                Order.countDocuments({ createdAt: { $lt: startDate } }),
                User.countDocuments({ 
                    role: 'user',
                    createdAt: { $lt: startDate }
                })
            ])
        ]);

        // Calculate growth percentages
        const calculateGrowth = (current, previous) => {
            if (!previous || previous === 0) return 100;
            return ((current - previous) / previous * 100).toFixed(2);
        };

        const earningsGrowth = calculateGrowth(
            currentPeriodData[0][0]?.total || 0,
            previousPeriodData[0][0]?.total || 0
        );
        const ordersGrowth = calculateGrowth(
            currentPeriodData[1],
            previousPeriodData[1]
        );
        const customersGrowth = calculateGrowth(
            currentPeriodData[2],
            previousPeriodData[2]
        );

        // Get recent orders (last 5)
        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name email')
            .lean();
        
        // Get top selling products
        const topProducts = await Order.aggregate([
            { $unwind: '$items' },
            { 
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' },
            { 
                $group: { 
                    _id: '$items.product',
                    name: { $first: '$items.name' },
                    images: { $first: '$productDetails.images' },
                    totalSales: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
                } 
            },
            { $sort: { totalSales: -1 } },
            { $limit: 5 }
        ]);
        
        // Get order status distribution
        const orderStatusStats = await Order.aggregate([
            { 
                $group: { 
                    _id: '$orderStatus', 
                    count: { $sum: 1 } 
                } 
            }
        ]);
        
        // Get revenue data for charts
        let groupByFormat, dateFormat;
        switch(timePeriod) {
            case 'yearly':
                groupByFormat = '%Y-%m'; // Group by month for yearly view
                dateFormat = 'MMM YYYY';
                break;
            case 'monthly':
                groupByFormat = '%Y-%m-%d'; // Group by day for monthly view
                dateFormat = 'DD MMM';
                break;
            default: // weekly
                groupByFormat = '%Y-%m-%d'; // Group by day for weekly view
                dateFormat = 'ddd';
        }

        const revenueData = await Order.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: startDate },
                    'paymentInfo.status': 'Paid'
                } 
            },
            { 
                $group: { 
                    _id: { 
                        $dateToString: { 
                            format: groupByFormat, 
                            date: "$createdAt" 
                        } 
                    },
                    total: { $sum: '$totalAmount' },
                    count: { $sum: 1 }
                } 
            },
            { $sort: { _id: 1 } }
        ]);

        // Format dates for charts
        const formattedRevenueData = revenueData.map(item => ({
            ...item,
            formattedDate: moment(item._id, groupByFormat === '%Y-%m' ? 'YYYY-MM' : 'YYYY-MM-DD')
                .format(dateFormat)
        }));

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            user: req.session.user || null,
            timePeriod,
            dashboardData: {
                totalEarnings: currentPeriodData[0][0]?.total || 0,
                earningsGrowth,
                totalOrders: currentPeriodData[1],
                ordersGrowth,
                totalCustomers: currentPeriodData[2],
                customersGrowth,
                recentOrders,
                topProducts,
                orderStatusStats,
                revenueData: formattedRevenueData,
                orderStatusDistribution: orderStatusStats.reduce((acc, stat) => {
                    acc[stat._id] = stat.count;
                    return acc;
                }, {})
            }
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).render('error', { message: 'Failed to load dashboard' });
    }
});
router.get('/admin/products', isAdmin, async (req, res) => {
    try {
        // Parse query params
        const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
        const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 12;
        const search = req.query.search ? req.query.search.trim() : '';
        const selectedCategory = req.query.category && req.query.category !== '' ? req.query.category : '';

        // Build query object
        const query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        if (selectedCategory) {
            query.category = selectedCategory;
        }

        // Fetch products with filter and pagination
        const products = await Product.find(query)
            .populate('category', 'name subCategories')
            .limit(limit)
            .skip((page - 1) * limit)
            .lean();

        // Fetch all categories for filter dropdown
        const categories = await Category.find();

        // Count total products for pagination
        const count = await Product.countDocuments(query);

        res.render('admin/products', {
            title: 'Admin Products',
            user: req.session.user || null,
            products,
            categories,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            limit,
            searchQuery: search,
            selectedCategory
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});
router.get('/admin/coupons', isAdmin, async (req, res) => {
    try {
        const categories = await Category.find({isActive:true}).populate('subCategories');
        const coupons = await Coupons.find().populate('applicableCategories').lean();
        res.render('admin/coupons', {
            title: 'Admin coupons',
            user: req.session.user || null,
            categories,
            coupons
        });
    } catch (err) {
        console.log(err);
        res.status(500).send('Error loading categories or coupons');
    }
});
router.get('/admin/category', isAdmin, async (req, res) => {
    try {
        const categories = await Category.find().populate('subCategories'); 
        res.render('admin/category', {
            title: 'Admin Category',
            user: req.session.user || null,
            categories
        });
    } catch (err) {
        console.log(err);
        res.status(500).send('Error loading categories');
    }
});

router.get('/admin-testimonials',isAdmin, (req, res) => {
    res.render('admin/testimonials');
  });
router.get('/admin-blogs',isAdmin, (req, res) => {
    res.render('admin/blogs');
  });
router.get('/admin-banners',isAdmin, (req, res) => {
    res.render('admin/banners');
  });
  router.get('/admin/orders', isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // Get filter parameters
        const statusFilter = req.query.status;
        const searchQuery = req.query.search;
        
        // Build the filter object
        let filter = {};
        
        if (statusFilter) {
            filter.$or = [
                { orderStatus: statusFilter },
                { 'deliveryInfo.status': statusFilter }
            ];
        }
        
        if (searchQuery) {
            const searchRegex = new RegExp(searchQuery, 'i');
            filter.$or = (filter.$or || []).concat([
                { 'billingAddress.name': searchRegex },
                { 'billingAddress.phone': searchRegex },
                { 'user': await User.find({ 
                    $or: [
                        { name: searchRegex },
                        { email: searchRegex }
                    ]
                }).distinct('_id') },
                { 'paymentInfo.razorpayOrderId': searchRegex }
            ]);
        }
        
        // Get total count of filtered orders
        const totalOrders = await Order.countDocuments(filter);
        
        // Get paginated and filtered orders
        const orders = await Order.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('user', 'name email')
            .lean();
            
        res.render('admin/orders', {
            orders,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            limit,
            currentStatus: statusFilter,
            currentSearch: searchQuery
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error', { message: 'Failed to load orders' });
    }
});

// Get order details for modal
router.get('/admin/orders/:id', isAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email phone')
            .populate('items.product', 'name images')
            .lean();
            
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.json(order);
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).json({ error: 'Failed to load order details' });
    }
});

// Update order status
router.put('/admin/orders/:id', isAdmin, async (req, res) => {
    try {
        const { orderStatus, deliveryStatus } = req.body;
        
        const updateData = {
            orderStatus,
            'deliveryInfo.status': deliveryStatus,
            'deliveryInfo.updatedAt': new Date()
        };
        
        // If delivered, set delivered date
        if (deliveryStatus === 'Delivered') {
            updateData['deliveryInfo.deliveredAt'] = new Date();
        }
        
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        
        res.json(updatedOrder);
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});
router.get('/admin/users', isAdmin, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
        const [users, total] = await Promise.all([
            User.find({})
                .skip(skip)
                .limit(limit)
                .select('-password -otp -otpExpires')
                .lean(),
            User.countDocuments()
        ]);

        res.render('admin/users', {
            users,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalUsers: total
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Failed to load users');
    }
});

module.exports = router;
