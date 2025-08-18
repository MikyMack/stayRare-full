const Testimonial = require('../models/Testimonial');
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

// Create Testimonial
exports.createTestimonial = async (req, res) => {
    try {
        const { name, designation, content, rating } = req.body;
        let imageUrl = null;

        if (req.file) {
            try {
                imageUrl = await uploadToS3(req.file, 'testimonials');
            } catch (err) {
                return res.status(500).json({ success: false, error: 'Image upload failed' });
            }
        }

        const testimonial = new Testimonial({
            name,
            designation,
            content,
            rating,
            imageUrl
        });

        await testimonial.save();
        res.status(201).json({ success: true, testimonial });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// List All Testimonials
exports.listTestimonials = async (req, res) => {
    try {
        const testimonials = await Testimonial.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, testimonials });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get Testimonial For Edit
exports.getTestimonialForEdit = async (req, res) => {
    try {
        const testimonial = await Testimonial.findById(req.params.id);
        if (!testimonial) {
            return res.status(404).json({ success: false, message: 'Testimonial not found' });
        }
        
        res.status(200).json({
            success: true,
            testimonial: {
                _id: testimonial._id,
                name: testimonial.name,
                designation: testimonial.designation,
                content: testimonial.content,
                rating: testimonial.rating,
                imageUrl: testimonial.imageUrl,
                isActive: testimonial.isActive
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Server error: ' + error.message 
        });
    }
};

// Update Testimonial
exports.updateTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const testimonial = await Testimonial.findById(id);
        if (!testimonial) {
            return res.status(404).json({ success: false, message: 'Testimonial not found' });
        }

        // If new image is uploaded, delete the old one from S3
        if (req.file) {
            // Delete old image from S3 if exists
            if (testimonial.imageUrl) {
                const key = getS3KeyFromUrl(testimonial.imageUrl);
                if (key) {
                    try {
                        await s3.send(new DeleteObjectCommand({
                            Bucket: process.env.S3_BUCKET,
                            Key: key,
                        }));
                    } catch (e) {
                        console.error('Failed to delete old testimonial image from S3:', e);
                    }
                }
            }
            // Upload new image
            try {
                updateData.imageUrl = await uploadToS3(req.file, 'testimonials');
            } catch (err) {
                return res.status(500).json({ success: false, error: 'Image upload failed' });
            }
        }

        testimonial.name = updateData.name || testimonial.name;
        testimonial.designation = updateData.designation || testimonial.designation;
        testimonial.content = updateData.content || testimonial.content;
        testimonial.rating = updateData.rating || testimonial.rating;
        if (updateData.imageUrl) testimonial.imageUrl = updateData.imageUrl;

        await testimonial.save();
        res.status(200).json({ success: true, testimonial });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Delete Testimonial
exports.deleteTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        const testimonial = await Testimonial.findById(id);
        if (!testimonial) {
            return res.status(404).json({ success: false, message: 'Testimonial not found' });
        }
        // Delete image from S3 if exists
        if (testimonial.imageUrl) {
            const key = getS3KeyFromUrl(testimonial.imageUrl);
            if (key) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET,
                        Key: key,
                    }));
                } catch (e) {
                    console.error('Failed to delete testimonial image from S3:', e);
                }
            }
        }
        await Testimonial.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: 'Testimonial deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Toggle isActive Status
exports.toggleTestimonialStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const testimonial = await Testimonial.findById(id);
        if (!testimonial) {
            return res.status(404).json({ success: false, message: 'Testimonial not found' });
        }
        testimonial.isActive = !testimonial.isActive;
        await testimonial.save();

        res.status(200).json({ 
            success: true, 
            message: `Testimonial ${testimonial.isActive ? 'activated' : 'deactivated'} successfully`,
            testimonial 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};