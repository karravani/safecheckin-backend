// routes/hotelRoutes.js - ADD this route
const express = require("express");
const router = express.Router();

const { authenticatePolice } = require("../middleware/policeAuth");
const {
  registerHotel,
  loginHotel,
  getHotelProfile,
  updateHotelProfile,
  changePassword,
  refreshToken,
  logoutHotel,
  getHotelStats,
  getAllHotels,
  verifyHotel,
  updateVerificationStatus,
} = require("../controllers/hotelAuthController");
const { auth, rateLimiter } = require("../middleware/auth");

// Public routes (no authentication required)
router.post("/login", loginHotel);
router.post(
  "/register",
  (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      authenticatePolice(req, res, next);
    } else {
      next();
    }
  },
  registerHotel
);

// Public route to get all hotels (with optional filtering)
router.get("/all", getAllHotels);

// Police-only routes (before hotel auth middleware)
router.post("/verify/:hotelId", authenticatePolice, verifyHotel);
router.patch(
  "/:hotelId/verification-status",
  authenticatePolice,
  updateVerificationStatus
);

// NEW: Add owner info update route
router.patch("/:hotelId/owner-info", authenticatePolice, async (req, res) => {
  try {
    console.log("🔍 Owner info update request:", {
      hotelId: req.params.hotelId,
      user: req.user,
      body: req.body,
    });

    const { hotelId } = req.params;
    const { ownerName, ownerPhone } = req.body;

    if (!ownerName || !ownerPhone) {
      return res.status(400).json({
        success: false,
        error: "Owner name and phone number are required",
      });
    }

    // Validate phone number
    if (!/^[0-9]{10}$/.test(ownerPhone.replace(/\D/g, ""))) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid 10-digit phone number",
      });
    }

    const Hotel = require("../models/Hotel");
    const hotel = await Hotel.findById(hotelId);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        error: "Hotel not found",
      });
    }

    const previousOwnerName = hotel.ownerName;
    const previousOwnerPhone = hotel.ownerPhone;

    // Update owner information
    hotel.ownerName = ownerName.trim();
    hotel.ownerPhone = ownerPhone.trim();
    await hotel.save();

    console.log("✅ Owner info updated successfully:", {
      hotelId,
      previousOwnerName,
      newOwnerName: ownerName,
      previousOwnerPhone,
      newOwnerPhone: ownerPhone,
    });

    // Log activity
    try {
      const { logActivity } = require("../controllers/activityController");
      await logActivity(
        req.user.policeId,
        "hotel_owner_updated",
        "hotel",
        hotel._id,
        {
          hotelName: hotel.name,
          updatedBy: req.user.name || "Police Officer",
          previousOwnerName,
          newOwnerName: ownerName,
          previousOwnerPhone,
          newOwnerPhone: ownerPhone,
        },
        req
      );
    } catch (logError) {
      console.error("❌ Failed to log owner update activity:", logError);
    }

    res.json({
      success: true,
      message: "Owner information updated successfully",
      hotel: {
        id: hotel._id,
        ownerName: hotel.ownerName,
        ownerPhone: hotel.ownerPhone,
      },
    });
  } catch (error) {
    console.error("❌ Update owner info error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update owner information",
      details: error.message,
    });
  }
});

// NEW: Add verification history route
router.get(
  "/:hotelId/verification-history",
  authenticatePolice,
  async (req, res) => {
    try {
      const Hotel = require("../models/Hotel");
      const hotel = await Hotel.findById(req.params.hotelId)
        .select(
          "name verificationHistory verificationStatus isVerified verifiedAt verificationNotes"
        )
        .populate(
          "verificationHistory.changedBy",
          "name badgeNumber station rank"
        );

      if (!hotel) {
        return res.status(404).json({
          success: false,
          error: "Hotel not found",
        });
      }

      res.json({
        success: true,
        data: {
          hotelId: hotel._id,
          hotelName: hotel.name,
          currentStatus: {
            verificationStatus: hotel.verificationStatus,
            isVerified: hotel.isVerified,
            verifiedAt: hotel.verifiedAt,
            verificationNotes: hotel.verificationNotes,
          },
          history: hotel.verificationHistory.reverse(), // Most recent first
        },
      });
    } catch (error) {
      console.error("Get verification history error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch verification history",
      });
    }
  }
);

// Protected routes (hotel authentication required)
router.use(auth); // All routes below require hotel authentication

// Hotel profile management
router.get("/profile", getHotelProfile);
router.put("/profile", updateHotelProfile);

// Authentication management
router.post("/change-password", changePassword);
router.post("/refresh-token", refreshToken);
router.post("/logout", logoutHotel);

// Hotel statistics and analytics
router.get("/stats", getHotelStats);

// Route for hotels to view their own verification status
router.get("/verification/status", async (req, res) => {
  try {
    const Hotel = require("../models/Hotel");
    const hotel = await Hotel.findById(req.hotelId)
      .select(
        "verificationStatus isVerified verifiedAt verificationNotes verificationHistory"
      )
      .populate("verifiedBy", "name badgeNumber station rank")
      .populate(
        "verificationHistory.changedBy",
        "name badgeNumber station rank"
      );

    if (!hotel) {
      return res.status(404).json({ error: "Hotel not found" });
    }

    res.json({
      success: true,
      data: {
        currentStatus: {
          verificationStatus: hotel.verificationStatus,
          isVerified: hotel.isVerified,
          verifiedAt: hotel.verifiedAt,
          verificationNotes: hotel.verificationNotes,
          verifiedBy: hotel.verifiedBy,
        },
        statusHistory: hotel.verificationHistory.reverse(), // Most recent first
      },
    });
  } catch (error) {
    console.error("Get hotel verification status error:", error);
    res.status(500).json({
      error: "Failed to fetch verification status",
    });
  }
});

// Health check for authenticated hotels
router.get("/health", (req, res) => {
  res.json({
    message: "Hotel authentication is working",
    hotelId: req.hotelId,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
