const mongoose = require('mongoose');

const mobileBannerSchema = new mongoose.Schema({
  image: String,
  link: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('MobileBanner', mobileBannerSchema);
