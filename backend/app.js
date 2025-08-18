const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();
require('./config/passport'); 

const authRoutes = require('./routes/authRoutes');
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');
const cuponRoutes = require('./routes/couponRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const addressRoutes = require('./routes/addressRoutes');
const razorpayRoutes = require('./routes/razorpayRoutes');
const Category = require('./models/Category');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 60 * 60 * 24 * 7 
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, 
    httpOnly: true,
    secure: false, 
    sameSite: 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
  if (!req.user && req.session.user) {
    req.user = req.session.user;
  }
  next();
});
app.use(flash());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', authRoutes);
app.use('/', publicRoutes);
app.use('/', adminRoutes);
app.use('/', apiRoutes); 
app.use('/', cuponRoutes); 
app.use('/', cartRoutes); 
app.use('/', wishlistRoutes); 
app.use('/', addressRoutes); 
app.use('/', razorpayRoutes); 


// Flash messages middleware
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  next();
});


app.use(async (err, req, res, next) => {
  console.error(err.stack || err);
  let categories = [];
  try {
    categories = await Category.find({ isActive: true })
      .select('name imageUrl isActive subCategories')
      .lean();
  } catch (catErr) {
    console.error('Error fetching categories for error page:', catErr);
  }
  res.status(err.status || 500);
  res.render('user/error', {
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {},
    user: req.user || null,
    categories
  });
});

app.use(async (req, res) => {
  let categories = [];
  try {
    categories = await Category.find({ isActive: true })
      .select('name imageUrl isActive subCategories')
      .lean();
  } catch (catErr) {
    console.error('Error fetching categories for 404 page:', catErr);
  }
  res.status(404).render('user/error', {
    message: 'Page Not Found',
    error: {},
    user: req.user || null,
    categories
  });
});





module.exports = app;
