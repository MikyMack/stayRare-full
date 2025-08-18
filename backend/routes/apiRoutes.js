const express = require('express');
const router = express.Router();
const { multerUpload } = require('../middleware/uploadS3');  
const categoryController = require('../controllers/categoryController');
const productController = require('../controllers/productController');
const blogController = require('../controllers/blogController');
const testimonialController = require('../controllers/testimonialController');
const mainBannerCtrl = require('../controllers/mainBannerController');
const bannerTwoCtrl = require('../controllers/bannerTwoController');
const bannerThreeCtrl = require('../controllers/bannerThreeController');
const bannerMobileCtrl = require('../controllers/mobileBannerController');
const Product = require("../models/Product")
const Category = require("../models/Category")


router.post('/upload', multerUpload.single('image'), async (req, res) => {
  try {
    const folder = req.body.folder || 'uploads';
    const url = await uploadToS3(req.file, folder);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', categoryController.getAllCategories);
router.post('/categories', multerUpload.single('image'), categoryController.addCategory);
router.put('/categories/:id', multerUpload.single('image'), categoryController.editCategory);
router.delete('/categories/:id', categoryController.deleteCategory);
router.put('/categories/:id/toggle', categoryController.toggleCategory);

router.post('/categories/:categoryId/subcategories', multerUpload.single('image'), categoryController.addSubCategory);
router.put('/categories/:categoryId/subcategories/:subcategoryId', multerUpload.single('image'), categoryController.editSubCategory);
router.delete('/categories/:categoryId/subcategories/:subcategoryId', categoryController.deleteSubCategory);
router.put('/categories/:categoryId/subcategories/:subcategoryId/toggle', categoryController.toggleSubCategory);

// Product routes
router.get('/products', productController.getAllProducts);
router.get('/products/:id', productController.getProduct);
router.post('/products', multerUpload.any(), productController.createProduct);
router.put('/products/:id', multerUpload.any(), productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);
router.patch('/products/:id/status', productController.toggleProductStatus);
router.get('/product-type/:type', productController.getProductsByType);
router.post('/products/:id/reviews', async (req, res) => {
  try {
    const { name, rating, review } = req.body;

    if (!name || !rating || !review) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const newReview = {
      name,
      rating: parseInt(rating, 10),
      review,
      createdAt: new Date()
    };

    product.reviews.push(newReview);
    await product.save();

    return res.json({
      success: true,
      message: 'Review added successfully',
      review: newReview
    });
  } catch (error) {
    console.error('Error adding review:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.post('/admin-blogs', multerUpload.single('image'), blogController.createBlog);
router.get('/get-admin-blogs', blogController.getAllBlogs);
router.get('/admin-blogs/:id', blogController.getBlogById);
router.put('/admin-blogs/:id', multerUpload.single('image'), blogController.updateBlog);
router.delete('/admin-blogs/:id', blogController.deleteBlog);

router.post('/admin-testimonials', multerUpload.single('image'), testimonialController.createTestimonial);
router.get('/testimonials', testimonialController.listTestimonials);
router.get('/admin-testimonials/:id', testimonialController.getTestimonialForEdit);
router.put('/admin-testimonials/:id', multerUpload.single('image'), testimonialController.updateTestimonial);
router.delete('/admin-testimonials/:id', testimonialController.deleteTestimonial);
router.patch('/admin-testimonials/toggle-status/:id', testimonialController.toggleTestimonialStatus);

router.get('/main', mainBannerCtrl.getAll);
router.post('/main', multerUpload.single('image'), mainBannerCtrl.create);
router.put('/main/:id', multerUpload.single('image'), mainBannerCtrl.update);
router.delete('/main/:id', mainBannerCtrl.delete);
router.patch('/main/:id/toggle', mainBannerCtrl.toggleStatus);

// Banner Two Routes
router.get('/two', bannerTwoCtrl.getAll);
router.post('/two', multerUpload.single('image'), bannerTwoCtrl.create);
router.put('/two/:id', multerUpload.single('image'), bannerTwoCtrl.update);
router.delete('/two/:id', bannerTwoCtrl.delete);
router.patch('/two/:id/toggle', bannerTwoCtrl.toggleStatus);

// Banner Three Routes
router.get('/three', bannerThreeCtrl.getAll);
router.post('/three', multerUpload.single('image'), bannerThreeCtrl.create);
router.put('/three/:id', multerUpload.single('image'), bannerThreeCtrl.update);
router.delete('/three/:id', bannerThreeCtrl.delete);
router.patch('/three/:id/toggle', bannerThreeCtrl.toggleStatus);

router.get('/mobile', bannerMobileCtrl.getAll);
router.post('/mobile', multerUpload.single('image'), bannerMobileCtrl.create);
router.put('/mobile/:id', multerUpload.single('image'), bannerMobileCtrl.update);
router.delete('/mobile/:id', bannerMobileCtrl.delete);
router.patch('/mobile/:id/toggle', bannerMobileCtrl.toggleStatus);

router.get('/search/suggestions', async (req, res) => {
    try {
      const query = req.query.q;

      const categories = await Category.find({
        name: { $regex: query, $options: 'i' }
      }).select('_id subCategories');
  
      const categoryIds = categories.map(cat => cat._id);

      let subcategoryIds = [];
      categories.forEach(cat => {
        cat.subCategories.forEach(sub => {
          if (sub.name.toLowerCase().includes(query.toLowerCase())) {
            subcategoryIds.push(sub._id);
          }
        });
      });

      const suggestions = await Product.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { category: { $in: categoryIds } },
          { subcategory: { $in: subcategoryIds } }
        ],
        isActive: true
      })
        .select('name basePrice images')
        .limit(8);
  
      res.json(suggestions);
  
    } catch (error) {
      console.error('Error in /search/suggestions:', error);
      res.status(500).json({ error: 'Failed to get suggestions' });
    }
  });

// Full search endpoint
router.get('/search', async (req, res) => {
    try {
      const query = req.query.q;
  
      const categories = await Category.find({
        name: { $regex: query, $options: 'i' }
      }).select('_id subCategories');
  
      const categoryIds = categories.map(cat => cat._id);
  
      let subcategoryIds = [];
      categories.forEach(cat => {
        cat.subCategories.forEach(sub => {
          if (sub.name.toLowerCase().includes(query.toLowerCase())) {
            subcategoryIds.push(sub._id);
          }
        });
      });
  
      const products = await Product.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { category: { $in: categoryIds } },
          { subcategory: { $in: subcategoryIds } },
          { tags: { $regex: query, $options: 'i' } }
        ],
        isActive: true
      })
        .limit(30);
  
      res.json(products);
  
    } catch (error) {
      console.error('Error in /search:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });
  

module.exports = router;