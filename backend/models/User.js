const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, sparse: true }, 
  password: String,
  googleId: String,
  mobile: { type: String },
  otp: String,
  otpExpires: Date,
  otpVerified: { type: Boolean, default: false },
  role: { type: String, default: 'user', enum: ['user', 'admin', 'guest'] },
  isGuest: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false }
}, { timestamps: true });


module.exports = mongoose.model('User', userSchema);