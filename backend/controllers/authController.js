const User = require('../models/User');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const bcrypt = require('bcrypt');
const sendOtp = require('../utils/sendOtp');
const crypto = require('crypto');
const { generateUsersPDF } = require('../utils/pdfGenerator');
const path = require('path');
const fs = require('fs');


exports.mergeGuestCartToUserCart = async function(req, userId, guestCart = []) {
  if (!guestCart || guestCart.length === 0) return;

  try {
    // Find or create user's cart
    let userCart = await Cart.findOne({ user: userId }) || 
                  new Cart({ user: userId, items: [] });
    for (const guestItem of guestCart) {

      const productFromDb = await Product.findById(guestItem.productId);
      if (!productFromDb) continue; // skip if product not found

      const existingItem = userCart.items.find(item =>
        item.product.toString() === guestItem.productId &&
        item.selectedColor === guestItem.selectedColor &&
        item.selectedSize === guestItem.selectedSize
      );

      if (existingItem) {
        existingItem.quantity += guestItem.quantity;
      } else {
        userCart.items.push({
          product: guestItem.productId,
          quantity: guestItem.quantity,
          selectedColor: guestItem.selectedColor,
          selectedSize: guestItem.selectedSize,
          price: productFromDb.salePrice,
          productName: productFromDb.name || guestItem.productName,
          productImage: productFromDb.images[0] || guestItem.productImage
        });
      }
    }

    // Recalculate totals and save
    userCart.recalculateTotals();
    await userCart.save();

  } catch (err) {
    console.error('Error merging carts:', err);
    throw err;
  }
};

exports.storeGuestCart = (req, res) => {
  req.session.guestCart = req.body.guestCart;
  res.sendStatus(200);
};


// Register user
exports.register = async (req, res) => {
  const { name, email, password, mobile } = req.body;

  try {
    // Check if OTP was verified
    if (!req.session.otpVerified || req.session.otpEmail !== email) {
      return res.status(403).json({ success: false, message: 'OTP verification required' });
    }

    // Check if email is already registered (final check)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashedPassword, mobile });

    // Clear session OTP data
    req.session.otp = null;
    req.session.otpEmail = null;
    req.session.otpVerified = false;
    req.session.otpExpires = null;

    res.json({ success: true, message: 'Registration successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
};
  

  exports.login = async (req, res) => {
    const { email, password, guestCart } = req.body;
  
    try {
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      // Check if user is blocked
      if (user.isBlocked) {
        return res.status(403).json({ success: false, message: 'Your account has been blocked. Please contact support.' });
      }
  
      req.session.user = user;

      const sessionGuestCart = req.session.guestCart || [];
      const localStorageGuestCart = guestCart || [];
      const combinedGuestCart = [...sessionGuestCart, ...localStorageGuestCart];
      
      if (combinedGuestCart.length > 0) {
        await exports.mergeGuestCartToUserCart(req, user._id, combinedGuestCart);
      }
      
      req.session.guestCart = [];
      if (req.session.guestCartId) {
        await Cart.deleteOne({ sessionId: req.session.guestCartId });
        delete req.session.guestCartId;
      }
      
      res.json({ 
        success: true, 
        message: 'Login successful', 
        redirect: user.role === 'admin' ? '/admin/dashboard' : '/' 
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Login failed' });
    }
  };



// Send OTP for login
exports.sendOtpLogin = async (req, res) => {
    const { email } = req.body;

    try {
      // Check if email is already registered
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }
  
      // Generate and store OTP in session instead of user document
      const otp = crypto.randomInt(100000, 999999).toString();
      req.session.otp = otp;
      req.session.otpEmail = email;
      req.session.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
  
      await sendOtp(email, otp);
      res.json({ success: true, message: 'OTP sent to your email' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
};

// Verify OTP for login
exports.verifyOtpRegister = async (req, res) => {
    const { email, otp } = req.body;
  
    try {
      // Verify against session storage
      if (!req.session.otp || 
          !req.session.otpEmail || 
          req.session.otpEmail !== email || 
          req.session.otp !== otp ||
          Date.now() > req.session.otpExpires) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
      }
  
      // Mark OTP as verified in session
      req.session.otpVerified = true;
      res.json({ success: true, message: 'OTP verified' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'OTP verification failed' });
    }
  };
  
  exports.checkEmail = async (req, res) => {
    const { email } = req.body;
    try {
      const user = await User.findOne({ email });
      res.json({ available: !user });
    } catch (err) {
      res.status(500).json({ available: false });
    }
  };

// Logout user
exports.logout = (req, res) => {
  req.logout(err => {
    if (err) {
      console.error(err);
    }
    req.session.destroy(() => {
      res.redirect('/auth/login');
    });
  });
};
exports.Admin_logout = (req, res) => {
  req.logout(err => {
    if (err) {
      console.error(err);
    }
    req.session.destroy(() => {
      res.redirect('/admin/login');
    });
  });
};

exports.adminLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user || user.role !== 'admin') {
        return res.status(401).send('Unauthorized');
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).send('Unauthorized');
      }
      req.session.user = { id: user._id, role: user.role, name: user.name };
      res.redirect('/admin/dashboard');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server error');
    }
  };


  exports.downloadUsersPDF = async (req, res) => {
    try {
      const users = await User.find().lean();
      
      const fileName = `users-report-${Date.now()}.pdf`;
      const filePath = path.join(__dirname, '..', 'temp', fileName);
      
      // Ensure temp directory exists
      if (!fs.existsSync(path.dirname(filePath))) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      }
      
      await generateUsersPDF(users, filePath);
      
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Error sending file:', err);
        }
        // Clean up the file after download
        fs.unlink(filePath, () => {});
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  };

  exports.toggleBlockUser = async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      user.isBlocked = !user.isBlocked;
      await user.save();
      
      res.json({ 
        success: true, 
        message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
        isBlocked: user.isBlocked
      });
    } catch (err) {
      console.error('Error toggling user block status:', err);
      res.status(500).json({ success: false, message: 'Failed to update user status' });
    }
  };
  
  exports.updateUserRole = async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      
      if (!['user', 'moderator', 'admin'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      user.role = role;
      await user.save();
      
      res.json({ 
        success: true, 
        message: `User role updated to ${role} successfully`,
        role: user.role
      });
    } catch (err) {
      console.error('Error updating user role:', err);
      res.status(500).json({ success: false, message: 'Failed to update user role' });
    }
  };