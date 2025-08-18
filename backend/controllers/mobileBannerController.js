const MainBanner = require('../models/mobilebanner');
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
    const isActive = req.body.isActive === 'true' || req.body.isActive === true;

    const activeCount = await MainBanner.countDocuments({ isActive: true });

    if (activeCount >= 5 && isActive) {
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

    // Create banner
    const banner = new MainBanner({
      image,
      link: req.body.link,
      isActive
    });

    await banner.save();
    res.status(201).json({ success: true, banner });
  } catch (err) {
    console.error('CREATE BANNER ERROR:', err);
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
    banner.link = req.body.link || banner.link;

    await banner.save();

    res.json({ success: true, banner });

  } catch (err) {
    console.error(err);
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
