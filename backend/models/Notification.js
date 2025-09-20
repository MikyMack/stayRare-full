const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['Promotional', 'Seasonal', 'Re-engagement', 'Transactional'], 
    default: 'Promotional' 
  },
  url: { type: String, default: '/' },  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
