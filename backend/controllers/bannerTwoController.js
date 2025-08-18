const MainBanner = require('../models/BannerTwo');
const { uploadToS3 } = require('../middleware/uploadS3');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

exports.create = async (req, res) => {
  try {
    const activeCount = await MainBanner.countDocuments({ isActive: true });
    if (activeCount >= 5 && req.body.isActive === 'true') {
      return res.status(400).json({ message: 'Only 5 active banners allowed' });
    }

    let image = null;
    if (req.file) {
      try {
        image = await uploadToS3(req.file, 'main-banners'); 
      } catch (uploadErr) {
        console.error('S3 upload error:', uploadErr);
        return res.status(500).json({ success: false, message: 'Image upload failed' });
      }
    }

    const banner = new MainBanner({
      title: req.body.title,
      subtitle: req.body.subtitle,
      description: req.body.description,
      image,
      link: req.body.link,
      isActive: req.body.isActive === 'true'
    });

    await banner.save();
    res.status(201).json({ success: true, banner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const banner = await MainBanner.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });

    if (req.file) {
      const newImageUrl = await uploadToS3(req.file, 'main-banners');
      banner.image = newImageUrl; 
    }
    banner.title = req.body.title || banner.title;
    banner.subtitle = req.body.subtitle || banner.subtitle;
    banner.description = req.body.description || banner.description;
    banner.link = req.body.link || banner.link;

    await banner.save();
    res.json({ success: true, banner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const banner = await MainBanner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });

    if (banner.image) {
      const imageUrl = banner.image;
      const bucketName = process.env.S3_BUCKET;

      // Extract the S3 object key from the image URL
      const key = imageUrl.split(`.amazonaws.com/`)[1];

      if (key) {
        try {
          await s3.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
          }));
        } catch (e) {
          console.error('Error deleting image from S3:', e);
        }
      }
    }

    res.json({ success: true, message: 'Banner deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const banner = await MainBanner.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });

    const activeCount = await MainBanner.countDocuments({ isActive: true });
    if (!banner.isActive && activeCount >= 5) {
      return res.status(400).json({ message: 'Cannot activate more than 5 banners' });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    res.json({ success: true, isActive: banner.isActive });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAll = async (req, res) => {
  const banners = await MainBanner.find().sort({ createdAt: -1 });
  res.json({ success: true, banners });
};
