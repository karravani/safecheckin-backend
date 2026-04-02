// middleware/upload.js - FIXED for Windows paths
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");

// Create organized directory structure for hotel files
const createHotelDirectories = async (hotelId) => {
  const baseDir = path.join(__dirname, "../uploads");
  const hotelDir = path.join(baseDir, `hotel-${hotelId}`);
  const guestPhotosDir = path.join(hotelDir, "guest-photos");
  const idDocsDir = path.join(hotelDir, "id-documents");

  try {
    await fs.mkdir(baseDir, { recursive: true });
    await fs.mkdir(hotelDir, { recursive: true });
    await fs.mkdir(guestPhotosDir, { recursive: true });
    await fs.mkdir(idDocsDir, { recursive: true });

    console.log("✅ Directory structure ready:", {
      hotelDir: path.basename(hotelDir),
      guestPhotosDir: path.basename(guestPhotosDir),
      idDocsDir: path.basename(idDocsDir),
    });

    return { guestPhotosDir, idDocsDir, hotelDir };
  } catch (error) {
    console.error("❌ Error creating directories:", error);
    throw error;
  }
};

// Configure multer storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const hotelId = req.user?.hotelId || "default";
      const { guestPhotosDir, idDocsDir } = await createHotelDirectories(
        hotelId
      );

      // Organize by file type
      const targetDir =
        file.fieldname === "guestPhoto" ? guestPhotosDir : idDocsDir;

      console.log(`📁 Destination for ${file.fieldname}: ${targetDir}`);
      cb(null, targetDir);
    } catch (error) {
      console.error("❌ Error in destination:", error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    try {
      // Generate unique filename: TIMESTAMP-GUESTNAME-FIELDNAME.EXT
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const guestName = (req.body.name || "guest")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 20);
      const extension = path.extname(file.originalname).toLowerCase();
      const fieldName = file.fieldname;

      const filename = `${timestamp}-${guestName}-${fieldName}${extension}`;

      console.log(`📝 Generated filename: ${filename}`);
      cb(null, filename);
    } catch (error) {
      console.error("❌ Error in filename:", error);
      cb(error);
    }
  },
});

// File filter - only images
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
      `Invalid file type. Only JPEG, PNG, and WebP allowed. Received: ${file.mimetype}`
    );
    console.error("❌ File rejected:", error.message);
    cb(error, false);
  }
};

// Multer configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 3, // Max 3 files per upload
  },
});

// Main upload middleware - handles multiple file fields
const uploadGuestPhotos = upload.fields([
  { name: "guestPhoto", maxCount: 1 },
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
]);

// Process uploaded files - create database-ready paths
const processUploadedFiles = (req, res, next) => {
  try {
    console.log("\n=== Processing Uploaded Files ===");

    req.photoPaths = {};

    if (!req.files || Object.keys(req.files).length === 0) {
      console.log("⚠️ No files were uploaded");
      return next();
    }

    const hotelId = req.user?.hotelId || "default";
    const projectRoot = path.join(__dirname, "..");

    // Process each uploaded file field
    Object.entries(req.files).forEach(([fieldName, fileArray]) => {
      if (fileArray && fileArray.length > 0) {
        const file = fileArray[0];

        // CRITICAL FIX: Convert absolute path to relative using forward slashes
        // This works on Windows and Unix
        const absolutePath = file.path;
        const relativePath = path.relative(projectRoot, absolutePath);

        // IMPORTANT: Convert Windows backslashes to forward slashes for URLs
        const urlPath = relativePath.replace(/\\/g, "/");

        console.log(`\n✅ Processed ${fieldName}:`);
        console.log(`   Filename: ${file.filename}`);
        console.log(`   Absolute path: ${absolutePath}`);
        console.log(`   Relative path: ${relativePath}`);
        console.log(`   URL path: ${urlPath}`);
        console.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
        console.log(`   MIME: ${file.mimetype}`);

        // Store with all metadata needed for serving
        req.photoPaths[fieldName] = {
          path: urlPath, // "uploads/hotel-123/guest-photos/filename.jpg" with forward slashes
          filename: file.filename,
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
      `   Total files uploaded: ${Object.keys(req.photoPaths).length}`
    );
    console.log(
      `   Files: ${Object.keys(req.photoPaths).join(", ") || "none"}`
    );
    console.log("\n📋 Final photoPaths object:");
    Object.entries(req.photoPaths).forEach(([key, val]) => {
      console.log(`   ${key}: ${val.path}`);
    });

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
