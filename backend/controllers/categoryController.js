 const Category = require('../models/Category');
 const { uploadToS3 } = require('../middleware/uploadS3');
 const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

 const s3 = new S3Client({
   region: process.env.AWS_REGION,
   credentials: {
     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
   },
 });

 function getS3KeyFromUrl(url) {
   if (!url) return null;
   const idx = url.indexOf('.amazonaws.com/');
   if (idx === -1) return null;
   return url.substring(idx + '.amazonaws.com/'.length);
 }

 exports.getAllCategories = async (req, res) => {
     try {
         const categories = await Category.find({});
         res.json({ categories });
     } catch (error) {
         res.status(500).json({ message: error.message });
     }
 };

 exports.addCategory = async (req, res) => {
     try {
         const { name } = req.body;
         let imageUrl = null;

         if (req.file) {
            try {
              imageUrl = await uploadToS3(req.file, 'categories');
            } catch (err) {
              console.error("🔥 Controller caught error:", err);
              return res.status(500).json({ message: 'Image upload failed', error: err.message });
            }
          }
          
         if (!imageUrl) {
             return res.status(400).json({ message: 'Image is required' });
         }

         const newCategory = new Category({ name, imageUrl });
         await newCategory.save();
         res.status(201).json(newCategory);
     } catch (error) {
         res.status(400).json({ message: error.message });
     }
 };

 // Edit category
 exports.editCategory = async (req, res) => {
     try {
         const { id } = req.params;
         const { name } = req.body;
         let imageUrl = undefined;

         const category = await Category.findById(id);
         if (!category) {
             return res.status(404).json({ message: 'Category not found' });
         }

         // If new image is uploaded, delete the old one from S3
         if (req.file) {
             imageUrl = await uploadToS3(req.file, 'categories');
             if (category.imageUrl) {
                 const key = getS3KeyFromUrl(category.imageUrl);
                 if (key) {
                     try {
                         await s3.send(new DeleteObjectCommand({
                             Bucket: process.env.S3_BUCKET,
                             Key: key,
                         }));
                     } catch (e) {
                         console.error('Failed to delete old category image from S3:', e);
                     }
                 }
             }
         }

         const updatedCategory = await Category.findByIdAndUpdate(
             id,
             {
                 name,
                 ...(imageUrl && { imageUrl }) // Only update imageUrl if new image was uploaded
             },
             { new: true }
         );
         res.json(updatedCategory);
     } catch (error) {
         res.status(400).json({ message: error.message });
     }
 };

 // Delete category (and all its subcategories)
 exports.deleteCategory = async (req, res) => {
     try {
         const { id } = req.params;
         const category = await Category.findById(id);

         if (!category) {
             return res.status(404).json({ message: 'Category not found' });
         }

         // Delete category image from S3 (don't await, and don't stop if it fails)
         if (category.imageUrl) {
             const key = getS3KeyFromUrl(category.imageUrl);
             if (key) {
                 s3.send(new DeleteObjectCommand({
                     Bucket: process.env.S3_BUCKET,
                     Key: key,
                 })).catch(e =>
                     console.error('Failed to delete category image from S3:', e)
                 );
             }
         }

         // Delete all subcategory images from S3 (same approach)
         const subcategoryDeletions = category.subCategories.map(subcategory => {
             if (subcategory.imageUrl) {
                 const key = getS3KeyFromUrl(subcategory.imageUrl);
                 if (key) {
                     return s3.send(new DeleteObjectCommand({
                         Bucket: process.env.S3_BUCKET,
                         Key: key,
                     })).catch(e =>
                         console.error('Failed to delete subcategory image from S3:', e)
                     );
                 }
             }
             return Promise.resolve();
         });

         // Wait for all image deletions to attempt (but don't fail if they do)
         await Promise.allSettled(subcategoryDeletions);

         // Delete the category regardless of image deletion results
         await Category.findByIdAndDelete(id);
         res.json({ message: 'Category deleted successfully' });
     } catch (error) {
         res.status(400).json({ message: error.message });
     }
 };

 // Toggle category status (and all its subcategories)
 exports.toggleCategory = async (req, res) => {
     try {
         const { id } = req.params;
         const category = await Category.findById(id);

         if (!category) {
             return res.status(404).json({ message: 'Category not found' });
         }

         // Toggle category status
         category.isActive = !category.isActive;

         // Toggle all subcategories status to match the category
         category.subCategories.forEach(sub => {
             sub.isActive = category.isActive;
         });

         await category.save();
         res.json(category);
     } catch (error) {
         res.status(400).json({ message: error.message });
     }
 };

 // Add subcategory
 exports.addSubCategory = async (req, res) => {
     try {
         const { categoryId } = req.params;
         const { name } = req.body;
         let imageUrl = null;

         if (req.file) {
             try {
                 imageUrl = await uploadToS3(req.file, 'subcategories');
             } catch (err) {
                 return res.status(500).json({ message: 'Image upload failed' });
             }
         }

         const category = await Category.findById(categoryId);
         if (!category) {
             return res.status(404).json({ message: 'Category not found' });
         }

         category.subCategories.push({ name, imageUrl });
         await category.save();
         res.status(201).json(category);
     } catch (error) {
         res.status(400).json({ message: error.message });
     }
 };

 // Edit subcategory
 exports.editSubCategory = async (req, res) => {
     try {
         const { categoryId, subcategoryId } = req.params;
         const { name } = req.body;
         let imageUrl = undefined;

         const category = await Category.findById(categoryId);
         if (!category) {
             return res.status(404).json({ message: 'Category not found' });
         }

         const subcategory = category.subCategories.id(subcategoryId);
         if (!subcategory) {
             return res.status(404).json({ message: 'Subcategory not found' });
         }

         // If new image is uploaded, delete the old one from S3
         if (req.file) {
             imageUrl = await uploadToS3(req.file, 'subcategories');
             if (subcategory.imageUrl) {
                 const key = getS3KeyFromUrl(subcategory.imageUrl);
                 if (key) {
                     try {
                         await s3.send(new DeleteObjectCommand({
                             Bucket: process.env.S3_BUCKET,
                             Key: key,
                         }));
                     } catch (e) {
                         console.error('Failed to delete old subcategory image from S3:', e);
                     }
                 }
             }
         }

         subcategory.name = name;
         if (imageUrl) {
             subcategory.imageUrl = imageUrl;
         }
         await category.save();
         res.json(category);
     } catch (error) {
         res.status(400).json({ message: error.message });
     }
 };

 // Delete subcategory
 exports.deleteSubCategory = async (req, res) => {
     try {
         const { categoryId, subcategoryId } = req.params;

         const category = await Category.findById(categoryId);
         if (!category) {
             return res.status(404).json({ message: 'Category not found' });
         }

         const subcategory = category.subCategories.id(subcategoryId);
         if (!subcategory) {
             return res.status(404).json({ message: 'Subcategory not found' });
         }

         // Delete subcategory image from S3 if it exists
         if (subcategory.imageUrl) {
             const key = getS3KeyFromUrl(subcategory.imageUrl);
             if (key) {
                 try {
                     await s3.send(new DeleteObjectCommand({
                         Bucket: process.env.S3_BUCKET,
                         Key: key,
                     }));
                 } catch (error) {
                     console.error('Error deleting image from S3:', error);
                     // Continue with deletion even if image deletion fails
                 }
             }
         }

         category.subCategories.pull(subcategoryId);
         await category.save();

         res.json({
             success: true,
             message: 'Subcategory deleted successfully',
             updatedCategory: category
         });
     } catch (error) {
         console.error('Error in deleteSubCategory:', error);
         res.status(500).json({
             success: false,
             message: 'Internal server error',
             error: error.message
         });
     }
 };

 // Toggle subcategory status
 exports.toggleSubCategory = async (req, res) => {
     try {
         const { categoryId, subcategoryId } = req.params;

         const category = await Category.findById(categoryId);
         if (!category) {
             return res.status(404).json({ message: 'Category not found' });
         }

         const subcategory = category.subCategories.id(subcategoryId);
         if (!subcategory) {
             return res.status(404).json({ message: 'Subcategory not found' });
         }

         subcategory.isActive = !subcategory.isActive;
         await category.save();
         res.json(category);
     } catch (error) {
         res.status(400).json({ message: error.message });
     }
 };