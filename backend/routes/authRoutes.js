const express = require('express');
const router = express.Router();
const passport = require('passport');

const auth = require('../controllers/authController');
const Category = require('../models/Category')
const User = require ("../models/User")
const sendOtp = require('../utils/sendOtp');
const bcrypt = require('bcrypt');
 
// Form submissions
router.post('/auth/register', auth.register);
router.post('/auth/login', auth.login);
router.post('/auth/admin-login', auth.adminLogin);
router.post('/auth/send-otp', auth.sendOtpLogin);
router.post('/auth/verify-otp', auth.verifyOtpRegister);
router.post('/auth/store-guest-cart', auth.storeGuestCart);
router.get('/auth/google', (req, res, next) => {
  const guestCart = req.query.guestCart;
  const state = guestCart ? encodeURIComponent(guestCart) : '';
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: state
  })(req, res, next);
});

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login' }),
  async (req, res) => {
    try {
      // Check if user is blocked
      if (req.user && req.user.isBlocked) {
        // Clear session user if set
        req.session.user = null;
        return res.status(403).json({
          success: false,
          message: 'Your account has been blocked. Please contact support.'
        });
      }

      req.session.user = req.user;

      let guestCart = [];
      if (req.query.state) {
        try {
          guestCart = JSON.parse(decodeURIComponent(req.query.state));
        } catch (err) {
          // Ignore parse errors
        }
      }

      if (guestCart.length > 0) {
        await auth.mergeGuestCartToUserCart(req, req.user._id, guestCart);
      }

      res.redirect('/?googleLogin=true');
    } catch (err) {
      console.error('Callback error:', err.message);
      res.redirect('/auth/login?error=google_failed');
    }
  }
);
  
  router.get('/users/download-pdf', auth.downloadUsersPDF);

  router.patch('/users/:userId/block', auth.toggleBlockUser);
router.patch('/users/:userId/role', auth.updateUserRole);

router.get('/auth/login', async(req, res) => {
  const categories = await Category.find({ isActive: true })
  .select('name imageUrl isActive subCategories')
  .lean();
  res.render('user/login', {
    title: 'Login',categories,
    user: req.session.user || null 
  });
});

router.post('/auth/check-email', auth.checkEmail);

router.get('/auth/logout', auth.logout);
router.get('/auth/admin-logout', auth.Admin_logout);

router.post('/forgot-password', async (req, res) => {
  try {
      const { email } = req.body;
      
      // Check if user exists
      const user = await User.findOne({ email });
      if (!user) {
          return res.status(400).json({ message: 'Email not found' });
      }
      
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      user.otp = otp;
      user.otpExpires = expiresAt;
      await user.save();

      await sendOtp(email, otp);
      
      res.json({ message: 'OTP sent successfully' });
  } catch (error) {
      console.error('Failed to send OTP:', error);
      res.status(500).json({ message: 'Failed to send OTP' });
  }
});

// Verify forgot password OTP
router.post('/verify-forgot-password-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Check if OTP exists and is valid
    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Check if OTP is expired
    if (new Date() > user.otpExpires) {
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();
      return res.status(400).json({ message: 'OTP expired' });
    }

    // Mark OTP as verified (no token needed)
    user.otpVerified = true;
    await user.save();
    
    res.json({ 
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to verify OTP' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Verify OTP is valid and not expired
    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpires) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

module.exports = router;
