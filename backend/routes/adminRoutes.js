const express = require('express');
const router = express.Router();
const moment = require('moment')
const webpush = require('web-push');
const isAdmin = require('../middleware/isAdmin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Coupons = require('../models/Coupon');
const Order = require('../models/Order');
const User = require('../models/User');
const Notification = require('../models/Notification');
const generateAdminOrderPDF = require('../utils/orderpdfGenerator');
const { refreshOrderStatuses } = require("../services/orderService");
const generateBulkOrdersPDF = require('../utils/bulkOrdersPdfGenerator');
const { sendNotificationToAllUsers } = require("../services/notificationService");



router.get('/admin/login', (req, res) => {
  res.render('admin/admin-login', {
    title: 'Admin Login',
    user: req.session.user || null 
  });
});

router.get('/admin/dashboard', isAdmin, async (req, res) => {
    try {
        const timePeriod = req.query.period || 'weekly';
        let startDate = new Date();
        switch(timePeriod) {
            case 'monthly':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'yearly':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate.setDate(startDate.getDate() - 7);
        }

        const [currentPeriodData, previousPeriodData, categories] = await Promise.all([
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
            ]),
            Category.find()
        ]);

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

        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name email')
            .lean();

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

        const orderStatusStats = await Order.aggregate([
            { 
                $group: { 
                    _id: '$orderStatus', 
                    count: { $sum: 1 } 
                } 
            }
        ]);

        let groupByFormat, dateFormat;
        switch(timePeriod) {
            case 'yearly':
                groupByFormat = '%Y-%m';
                dateFormat = 'MMM YYYY';
                break;
            case 'monthly':
                groupByFormat = '%Y-%m-%d';
                dateFormat = 'DD MMM';
                break;
            default:
                groupByFormat = '%Y-%m-%d';
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

        const formattedRevenueData = revenueData.map(item => ({
            ...item,
            formattedDate: moment(item._id, groupByFormat === '%Y-%m' ? 'YYYY-MM' : 'YYYY-MM-DD')
                .format(dateFormat)
        }));

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            user: req.session.user || null,
            timePeriod,
            categories,
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

        // Count total products for pagination (filtered)
        const count = await Product.countDocuments(query);

        // Count total products in DB (unfiltered)
        const totalProductsCount = await Product.countDocuments({});

        res.render('admin/products', {
            title: 'Admin Products',
            user: req.session.user || null,
            products,
            categories,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            limit,
            searchQuery: search,
            selectedCategory,
            totalProductsCount // send total products count in db
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


router.post('/admin/send-notification', isAdmin, async (req, res) => {
    try {
      const { title, message, type, url } = req.body;
  
      await Notification.create({ title, message, type, url });
  
      await sendNotificationToAllUsers(title, message, url);
  
      req.flash('success', 'Notification sent successfully!');
      res.redirect('/admin/dashboard');
    } catch (error) {
      console.error('Error sending notification:', error);
      req.flash('error', 'Failed to send notification');
      res.redirect('/admin/products');
    }
  });
  
router.get('/admin-testimonials',isAdmin, (req, res) => {
    res.render('admin/testimonials');
  });
router.get('/admin-blogs',isAdmin, (req, res) => {
    res.render('admin/blogs');
  });


  router.get('/order_management', isAdmin, async (req, res) => {
    // Refresh statuses before rendering
    await refreshOrderStatuses();
  
    // Fetch updated orders
    const orders = await Order.find().sort({ createdAt: -1 });
  
    res.render('admin/order-management', { orders });
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
      ).populate('user');
  
      if (updatedOrder.user && updatedOrder.user._id) {
        if (deliveryStatus === 'Shipped') {
          await sendNotificationToUser(
            updatedOrder.user._id,
            "Order Shipped 🚚",
            `Your order #${updatedOrder._id} is on the way!`,
            `/orders/${updatedOrder._id}`
          );
        } else if (deliveryStatus === 'Delivered') {
          await sendNotificationToUser(
            updatedOrder.user._id,
            "Order Delivered 📦",
            `Your order #${updatedOrder._id} has been delivered successfully.`,
            `/orders/${updatedOrder._id}`
          );
        }
      }
  
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

router.get("/manage-orders", async (req, res) => {
    try {
        if (req.query.orderId) {
            const order = await Order.find({ _id: req.query.orderId })
                .populate("user", "name email mobile")
                .populate("items.product", "name price")
                .lean();
            return res.json({ orders: order });
        }

        const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

        const filter = {};

        if (status) filter.orderStatus = status;
        if (startDate && endDate) {
            filter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const orders = await Order.find(filter)
            .populate("user", "name email mobile")
            .populate("items.product", "name price")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Order.countDocuments(filter);

        res.json({
            orders,
            pagination: {
                total,
                page: Number(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/admin/orders/:orderId/download-pdf', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId)
            .populate('user', 'name email')
            .populate('items.product', 'name price')
            .lean();

        if (!order) {
            return res.status(404).send('Order not found');
        }

        // Generate PDF buffer
        const pdfBuffer = await generateAdminOrderPDF(order);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="order_${order._id}.pdf"`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Error generating order PDF:', err);
        res.status(500).send('Failed to generate order PDF');
    }
});


router.get('/download-orders-bulk', async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const filter = {};

    if (status) filter.orderStatus = status;
    if (startDate && endDate) {
      filter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const orders = await Order.find(filter)
      .populate('user', 'name email')
      .populate('items.product', 'name price')
      .sort({ createdAt: -1 })
      .lean();

    if (!orders.length) return res.status(404).send('No orders found');

    // Use a dedicated PDF generator for bulk orders
    const bulkOrdersPdfBuffer = await generateBulkOrdersPDF(orders);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=orders_bulk.pdf',
      'Content-Length': bulkOrdersPdfBuffer.length
    });
    res.send(bulkOrdersPdfBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

router.post("/admin/update-stock", async (req, res) => {
    try {
      const { categoryId, mainStock, sizes } = req.body;
  
      if (!categoryId) {
        return res.status(400).json({ success: false, message: "Category is required" });
      }
  
      // If mainStock provided → update product stock
      if (mainStock !== "" && mainStock !== undefined) {
        await Product.updateMany(
          { category: categoryId },
          { $set: { stock: parseInt(mainStock) } }
        );
      }
  
      // If size-specific stocks provided → update individually
      if (sizes && typeof sizes === "object") {
        for (const [size, stockValue] of Object.entries(sizes)) {
          if (stockValue && stockValue !== "") {
            await Product.updateMany(
              { category: categoryId, "sizeVariants.size": size },
              { $set: { "sizeVariants.$.stock": parseInt(stockValue) } }
            );
          }
        }
      }
  
      res.redirect('/admin/dashboard');
    } catch (err) {
      console.error("Stock update error:", err);
      res.status(500).json({ success: false, message: "Something went wrong" });
    }
  });
  
  

module.exports = router;
