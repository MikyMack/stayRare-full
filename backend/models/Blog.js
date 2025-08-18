// models/Blog.js
const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    metaTitle: { type: String, required: true },
    metaDescription: { type: String, required: true },
    metaKeywords: { type: [String], required: true },
    content: { type: String, required: true },
    author: { type: String, required: true },
    imageUrl: { type: String, required: true },
    cloudinary_id: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Blog', BlogSchema);