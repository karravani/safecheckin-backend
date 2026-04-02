// routes/guestRoutes.js - COMPLETE production file upload routes
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs").promises;

// Production upload middleware
const {
  uploadGuestPhotos,
  processUploadedFiles,
} = require("../middleware/upload");

const {
  checkInGuest,
  getAllGuests,
  validateUniqueness,
  getGuestById,
  getGuestByRoom,
  getAllGuestsByRoom,
  checkOutGuest,
  updateGuest,
  getPhoto,
  getPhotoByPath,
} = require("../controllers/guestController");

const { auth } = require("../middleware/auth");

router.use(auth);

// Custom validation middleware for guests array from FormData
const validateGuestsFromFormData = (req, res, next) => {
  try {
    console.log("=== Validating Guests from FormData ===");
    console.log("Original guests value:", req.body.guests);

    if (typeof req.body.guests === "string") {
      try {
        req.body.guests = JSON.parse(req.body.guests);
        console.log("Parsed guests successfully:", req.body.guests);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid guests data format",
          errors: [
            {
              type: "field",
              msg: "Invalid JSON format for guests",
              path: "guests",
              location: "body",
            },
          ],
        });
      }
    }

    if (!Array.isArray(req.body.guests)) {
      console.error("Guests is not an array:", req.body.guests);
      return res.status(400).json({
        success: false,
        message: "Guests must be an array",
        errors: [
          {
            type: "field",
            msg: "Guests must be an array",
            path: "guests",
            location: "body",
          },
        ],
      });
    }

    console.log("✅ Guests validation passed");
    next();
  } catch (error) {
    console.error("Guests validation error:", error);
    return res.status(400).json({
      success: false,
      message: "Error processing guests data",
      errors: [
        {
          type: "field",
          msg: "Error processing guests data",
          path: "guests",
          location: "body",
        },
      ],
    });
  }
};

// Photo validation middleware
const validatePhotos = (req, res, next) => {
  console.log("=== Validating Photos ===");
  console.log(
    "Files received:",
    req.files ? Object.keys(req.files) : "No files"
  );

  if (
    !req.files ||
    !req.files.guestPhoto ||
    req.files.guestPhoto.length === 0
  ) {
    console.error("❌ Guest photo missing");
    return res.status(400).json({
      success: false,
      message: "Guest photo is required",
      errors: [
        {
          type: "field",
          msg: "Guest photo is required",
          path: "guestPhoto",
          location: "files",
        },
      ],
    });
  }

  console.log("✅ Photo validation passed");
  next();
};

// Validation middleware for check-in
const checkInValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),

  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    .isLength({ min: 10, max: 15 })
    .matches(/^[\+]?[\d]{10,15}$/)
    .withMessage("Please provide a valid phone number (10-15 digits)"),

  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage("Please provide a valid email address"),

  body("nationality").trim().notEmpty().withMessage("Nationality is required"),
  body("purpose").trim().notEmpty().withMessage("Purpose of visit is required"),

  body("guestCount")
    .isInt({ min: 1, max: 20 })
    .withMessage("Guest count must be between 1 and 20"),

  body("maleGuests")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Male guests count must be a non-negative number"),

  body("femaleGuests")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Female guests count must be a non-negative number"),

  body("childGuests")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Child guests count must be a non-negative number"),

  body("bookingMode")
    .isIn(["Direct", "Online", "Travel Agent"])
    .withMessage("Booking mode must be Direct, Online, or Travel Agent"),

  body("bookingWebsite")
    .if(body("bookingMode").equals("Online"))
    .trim()
    .notEmpty()
    .withMessage("Booking website is required for online bookings"),

  body("roomNumber").trim().notEmpty().withMessage("Room number is required"),

  body("totalAmount")
    .optional()
    .isNumeric()
    .withMessage("Total amount must be a number"),

  body("advanceAmount")
    .optional()
    .isNumeric()
    .withMessage("Advance amount must be a number"),

  // Custom validation for guest count matching
  body().custom((value, { req }) => {
    const {
      guestCount,
      maleGuests = 0,
      femaleGuests = 0,
      childGuests = 0,
    } = req.body;
    const total = parseInt(guestCount);
    const sum =
      parseInt(maleGuests) + parseInt(femaleGuests) + parseInt(childGuests);

    if (sum !== total) {
      throw new Error(
        `Guest count mismatch: total (${total}) should equal sum of male (${maleGuests}), female (${femaleGuests}), and child (${childGuests}) guests`
      );
    }
    return true;
  }),
];

// Separate validation for guests array (after parsing)
const validateGuestsArray = [
  body("guests")
    .isArray({ min: 1 })
    .withMessage("At least one guest detail is required"),

  body("guests.*.name").trim().notEmpty().withMessage("Guest name is required"),

  body("guests.*.idType")
    .isIn(["Passport", "National ID", "Driver License", "Voter ID", "Other"])
    .withMessage("Invalid ID type"),

  body("guests.*.idNumber")
    .trim()
    .notEmpty()
    .withMessage("ID number is required"),

  body("guests.*.email")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage("Please provide a valid email address for guest"),
];

// Check-out validation
const checkOutValidation = [
  body("checkOutDate")
    .optional()
    .isISO8601()
    .withMessage("Please provide a valid checkout date"),

  body("finalAmount")
    .optional()
    .isNumeric()
    .withMessage("Final amount must be a number"),

  body("notes")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Notes cannot exceed 500 characters"),
];

// Update validation
const updateValidation = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),

  body("phone")
    .optional()
    .trim()
    .matches(/^[\+]?[\d]{10,15}$/)
    .withMessage("Please provide a valid phone number"),

  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage("Please provide a valid email address"),

  body("totalAmount")
    .optional()
    .isNumeric()
    .withMessage("Total amount must be a number"),

  body("advanceAmount")
    .optional()
    .isNumeric()
    .withMessage("Advance amount must be a number"),
];

// PRODUCTION ROUTES WITH INSTANT FILE UPLOADS

// MAIN CHECK-IN ROUTE - INSTANT RESPONSE
router.post(
  "/checkin",
  uploadGuestPhotos, // INSTANT file save to disk (0.1 seconds)
  processUploadedFiles, // INSTANT path processing
  validateGuestsFromFormData, // Parse guests JSON
  checkInValidation, // Validate form data
  validateGuestsArray, // Validate guests array
  validatePhotos, // Ensure photos exist
  checkInGuest // Save to database and respond
);

// FIXED: Photo serving route that matches the URL structure
router.get("/photo/direct/:filename", (req, res) => {
  const filename = req.params.filename;
  console.log("📸 Photo request:", filename);

  // Direct path to uploads folder
  const filePath = path.join(__dirname, "../uploads", filename);

  console.log("📁 Looking for file at:", filePath);

  // Check if file exists synchronously for speed
  if (require("fs").existsSync(filePath)) {
    console.log("✅ File found, serving:", filename);

    // Set proper headers
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Send file directly
    return res.sendFile(path.resolve(filePath));
  } else {
    console.log("❌ File not found:", filePath);
    return res.status(404).json({
      error: "File not found",
      filename,
      path: filePath,
    });
  }
});

// Debug route to list all uploaded files
router.get("/debug/files", (req, res) => {
  const uploadsPath = path.join(__dirname, "../uploads");

  try {
    const files = require("fs").readdirSync(uploadsPath);
    const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));

    console.log("📄 Files in uploads:", imageFiles);

    res.json({
      success: true,
      uploadsPath,
      totalFiles: files.length,
      imageFiles: imageFiles,
      recentFiles: imageFiles.slice(-10), // Last 10 files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      uploadsPath,
    });
  }
});
// Helper function for recursive file search
async function recursiveFileSearch(dir, targetFilename) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const found = await recursiveFileSearch(fullPath, targetFilename);
        if (found) return found;
      } else if (entry.name === targetFilename) {
        console.log("🎯 Found file at:", fullPath);
        return fullPath;
      }
    }
  } catch (error) {
    console.warn("Warning: Cannot read directory:", dir, error.message);
  }
  return null;
}

// Alternative photo serving by guest ID and photo type
router.get("/guest/:guestId/photo/:photoType", getPhoto);

// EXISTING ROUTES
router.get("/validate", validateUniqueness);
router.get("/room", getGuestByRoom);
router.get("/all-by-room", getAllGuestsByRoom);
router.get("/", getAllGuests);

// Dynamic routes
router.get("/:id", getGuestById);
router.put("/:id/checkout", checkOutValidation, checkOutGuest);
router.put("/:id", updateValidation, updateGuest);

// Error handling middleware
router.use((error, req, res, next) => {
  console.error("Guest routes error:", error);

  // Handle multer errors
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File too large. Maximum size is 10MB.",
      code: "FILE_TOO_LARGE",
    });
  }

  if (error.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({
      success: false,
      message: "Too many files uploaded.",
      code: "TOO_MANY_FILES",
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error in guest operations",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

module.exports = router;
