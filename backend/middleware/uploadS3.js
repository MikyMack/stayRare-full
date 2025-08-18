// middlewares/uploadMiddleware.js
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Upload } = require('@aws-sdk/lib-storage');
const s3Client = require('../utils/s3Client');

const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const storage = multer.diskStorage({
  destination: tempDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const safeName = baseName.toLowerCase().replace(/\s+/g, '-');
    const seoSafeName = safeName.replace(/[^a-z0-9\-]/g, ''); 
    cb(null, `${seoSafeName}${ext}`);
  }
});

const multerUpload = multer({ storage });
const uploadToS3 = async (file, folder = 'misc') => {
  try {
    const fileStream = fs.createReadStream(file.path);
    const key = `${folder}/${file.filename}`;

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: fileStream,
        ContentType: file.mimetype,
      }
    });

    await upload.done();
    fs.unlinkSync(file.path);

    const s3Url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    return s3Url;

  } catch (err) {
    console.error("🔥 S3 upload error:", err);   // <--- log full AWS error
    throw err;
  }
};


module.exports = {
  multerUpload,
  uploadToS3
};
