const Blog = require('../models/Blog');
const { uploadToS3 } = require('../middleware/uploadS3');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Helper to extract S3 key from URL
function getS3KeyFromUrl(url) {
  if (!url) return null;
  const idx = url.indexOf('.amazonaws.com/');
  if (idx === -1) return null;
  return url.substring(idx + '.amazonaws.com/'.length);
}

exports.createBlog = async (req, res) => {
    try {
        const { title, metaTitle, metaDescription, metaKeywords, content, author } = req.body;
        
        if (!title || !metaTitle || !metaDescription || !metaKeywords || !content || !author) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (!req.file) return res.status(400).json({ message: "Blog image is required" });

        let imageUrl = null;
        try {
            imageUrl = await uploadToS3(req.file, 'blogs');
        } catch (err) {
            return res.status(500).json({ message: "Image upload failed" });
        }

        const newBlog = new Blog({
            title,
            metaTitle,
            metaDescription,
            metaKeywords: metaKeywords.split(','),
            content,
            author,
            imageUrl
        });

        await newBlog.save();
        res.status(201).json({ message: "Blog created successfully", newBlog });
    } catch (error) {
        res.status(500).json({ message: "Error creating blog", error: error.message });
    }
};

exports.getAllBlogs = async (req, res) => {
    try {
        const blogs = await Blog.find();
        res.status(200).json(blogs);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving blogs", error: error.message });
    }
};

exports.getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ message: "Blog not found" });
        res.status(200).json(blog);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving blog", error: error.message });
    }
};

exports.updateBlog = async (req, res) => {
    try {
        const { title, metaTitle, metaDescription, metaKeywords, content, author } = req.body;
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ message: "Blog not found" });

        if (req.file) {
            // Delete old image from S3 if exists
            if (blog.imageUrl) {
                const key = getS3KeyFromUrl(blog.imageUrl);
                if (key) {
                    try {
                        await s3.send(new DeleteObjectCommand({
                            Bucket: process.env.S3_BUCKET,
                            Key: key,
                        }));
                    } catch (e) {
                        console.error('Failed to delete old blog image from S3:', e);
                    }
                }
            }
            // Upload new image
            try {
                blog.imageUrl = await uploadToS3(req.file, 'blogs');
            } catch (err) {
                return res.status(500).json({ message: "Image upload failed" });
            }
        }

        blog.title = title || blog.title;
        blog.metaTitle = metaTitle || blog.metaTitle;
        blog.metaDescription = metaDescription || blog.metaDescription;
        blog.metaKeywords = metaKeywords ? metaKeywords.split(',') : blog.metaKeywords;
        blog.content = content || blog.content;
        blog.author = author || blog.author;

        await blog.save();
        res.status(200).json({ message: "Blog updated successfully", blog });
    } catch (error) {
        res.status(500).json({ message: "Error updating blog", error: error.message });
    }
};

exports.deleteBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }
        // Delete image from S3 if exists
        if (blog.imageUrl) {
            const key = getS3KeyFromUrl(blog.imageUrl);
            if (key) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET,
                        Key: key,
                    }));
                } catch (e) {
                    console.error(`Error deleting image from S3 for blog ${req.params.id}:`, e);
                }
            }
        }
        await Blog.deleteOne({ _id: blog._id });
        res.status(200).json({ message: "Blog deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting blog", error: error.message });
    }
};
