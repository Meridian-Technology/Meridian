const path = require('path');
const s3 = require('../aws-config');
const multer = require('multer');
const crypto = require('crypto');

// Define allowed file types
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp'
];

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// File type validation middleware
const fileFilter = (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
        return;
    }
    cb(null, true);
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
    fileFilter: fileFilter
});

// Generate a secure random filename
const generateSecureFileName = (originalName, prefix = '') => {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalName).toLowerCase();
    return `${prefix}${timestamp}-${randomString}${extension}`;
};

const uploadImageToS3 = async (file, folderName, customFileName = null) => {
    if (!file) {
        throw new Error('No file provided.');
    }

    // Validate file type again (double-check)
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new Error('Invalid file type.');
    }

    // Validate file size again (double-check)
    if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds limit.');
    }

    const fileName = customFileName || generateSecureFileName(file.originalname);
    const s3Params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: `${folderName}/${fileName}`,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Add security headers
        ContentDisposition: 'inline',
        CacheControl: 'public, max-age=31536000',
    };

    try {
        const s3Response = await s3.upload(s3Params).promise();
        return s3Response.Location;
    } catch (error) {
        console.error('Error uploading image to S3:', error);
        throw new Error('Failed to upload image to S3.');
    }
};

const deleteAndUploadImageToS3 = async (file, folderName, existingImageUrl, customFileName = null) => {
    if (!file) {
        throw new Error('No file provided.');
    }

    // Validate file type again (double-check)
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new Error('Invalid file type.');
    }

    // Validate file size again (double-check)
    if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds limit.');
    }

    const fileName = customFileName || generateSecureFileName(file.originalname);
    const s3ParamsUpload = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: `${folderName}/${fileName}`,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Add security headers
        ContentDisposition: 'inline',
        CacheControl: 'public, max-age=31536000',
    };

    try {
        //if an existing image URL is provided, delete it
        if (existingImageUrl) {
            const existingKey = existingImageUrl.split(`${process.env.AWS_S3_BUCKET_NAME}/`)[1];
            if (existingKey) {
                const s3ParamsDelete = {
                    Bucket: process.env.AWS_S3_BUCKET_NAME,
                    Key: existingKey,
                };

                await s3.deleteObject(s3ParamsDelete).promise();
                console.log(`Deleted existing image: ${existingKey}`);
            }
        }

        const s3Response = await s3.upload(s3ParamsUpload).promise();
        return s3Response.Location;
    } catch (error) {
        console.error('Error deleting or uploading image to S3:', error);
        throw new Error('Failed to delete or upload image to S3.');
    }
};

module.exports = { 
    uploadImageToS3, 
    deleteAndUploadImageToS3,
    upload // Export the multer upload middleware
};
