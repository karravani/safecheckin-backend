// middleware/upload.js - UPDATED: stores files in memory, converts to base64 for MongoDB
const multer = require("multer");
const path = require("path");

// ⚠️ CHANGED: diskStorage -> memoryStorage
// Files are no longer written to disk (won't survive redeploys on hosts like
// Render/Railway). Instead multer keeps the file buffer in memory so we can
// convert it to base64 and store it directly in the Mongo document.
const storage = multer.memoryStorage();

// File filter - only images (unchanged)
const fileFilter = (req, file, cb) => {
  const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
  const allowedExtensions = /\.(jpg|jpeg|png|webp)$/i;

  const hasValidMime = allowedMimes.includes(file.mimetype);
  const hasValidExt = allowedExtensions.test(path.extname(file.originalname));

  if (hasValidMime && hasValidExt) {
    console.log(`✅ File accepted: ${file.originalname} (${file.mimetype})`);
    cb(null, true);
  } else {
    const error = new Error(
      `Invalid file type. Only JPEG, PNG, and WebP allowed. Received: ${file.mimetype}`,
    );
    console.error("❌ File rejected:", error.message);
    cb(error, false);
  }
};

// Multer configuration (unchanged)
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 3, // Max 3 files per upload
  },
});

// Main upload middleware - handles multiple file fields (unchanged)
const uploadGuestPhotos = upload.fields([
  { name: "guestPhoto", maxCount: 1 },
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
]);

// Process uploaded files - convert each buffer to base64 for Mongo storage
const processUploadedFiles = (req, res, next) => {
  try {
    console.log("\n=== Processing Uploaded Files (base64/Mongo) ===");

    req.photoPaths = {};

    if (!req.files || Object.keys(req.files).length === 0) {
      console.log("⚠️ No files were uploaded");
      return next();
    }

    const hotelId = req.user?.hotelId || "default";

    // Process each uploaded file field
    Object.entries(req.files).forEach(([fieldName, fileArray]) => {
      if (fileArray && fileArray.length > 0) {
        const file = fileArray[0];

        // Convert the in-memory buffer straight to base64
        const base64Data = file.buffer.toString("base64");

        console.log(`\n✅ Processed ${fieldName}:`);
        console.log(`   Original name: ${file.originalname}`);
        console.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
        console.log(`   MIME: ${file.mimetype}`);

        // Store base64 + metadata needed for serving. Matches the
        // `photoSchema` fields in models/Guest.js
        req.photoPaths[fieldName] = {
          data: base64Data, // ⭐ NEW: base64 file content stored in Mongo
          filename: file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          uploadTime: new Date().toISOString(),
          hotelId: hotelId,
        };
      }
    });

    console.log("\n📸 Summary:");
    console.log(
      `   Total files uploaded: ${Object.keys(req.photoPaths).length}`,
    );
    console.log(
      `   Files: ${Object.keys(req.photoPaths).join(", ") || "none"}`,
    );

    next();
  } catch (error) {
    console.error("❌ Error in processUploadedFiles:", error);
    next(error);
  }
};

module.exports = {
  uploadGuestPhotos,
  processUploadedFiles,
};
