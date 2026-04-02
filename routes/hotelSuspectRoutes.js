// routes/hotelSuspectRoutes.js - Hotel view of suspects (READ-ONLY)
const express = require("express");
const router = express.Router();
const Suspect = require("../models/Suspect");
const { auth } = require("../middleware/auth");

// All routes require hotel authentication
router.use(auth);

// ========== GET SUSPECTS FOR CURRENT HOTEL ========== //
// GET /api/hotel/suspects
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "all" } = req.query;

    // Build query - only show suspects from this hotel
    const query = {
      hotelId: req.hotelId, // From auth middleware
      isActive: true,
    };

    if (status !== "all") {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [suspects, totalCount] = await Promise.all([
      Suspect.find(query)
        .populate("guestId", "name phone email roomNumber status")
        .populate("verifiedBy.policeId", "name rank badgeNumber station")
        .select("-updateHistory") // Don't show full update history to hotel
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Suspect.countDocuments(query),
    ]);

    res.json({
      success: true,
      suspects: suspects,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalSuspects: totalCount,
        hasNext: skip + parseInt(limit) < totalCount,
        hasPrev: parseInt(page) > 1,
      },
      readOnly: true, // Indicate this is read-only view
    });
  } catch (error) {
    console.error("Get hotel suspects error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch suspects",
      message: error.message,
    });
  }
});

// ========== GET SUSPECT DETAILS (READ-ONLY) ========== //
// GET /api/hotel/suspects/:suspectId
router.get("/:suspectId", async (req, res) => {
  try {
    const { suspectId } = req.params;

    const suspect = await Suspect.findOne({
      _id: suspectId,
      hotelId: req.hotelId, // Ensure hotel can only see their own suspects
      isActive: true,
    })
      .populate("guestId", "name phone email roomNumber status checkInTime")
      .populate("verifiedBy.policeId", "name rank badgeNumber station")
      .populate(
        "associatedAlerts.alertId",
        "title type priority status createdAt"
      )
      .select("-updateHistory") // Don't show update history to hotel
      .lean();

    if (!suspect) {
      return res.status(404).json({
        success: false,
        error: "Suspect not found or access denied",
      });
    }

    res.json({
      success: true,
      suspect: suspect,
      readOnly: true,
    });
  } catch (error) {
    console.error("Get suspect details error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch suspect details",
      message: error.message,
    });
  }
});

// ========== GET SUSPECT STATISTICS FOR HOTEL ========== //
// GET /api/hotel/suspects/stats
router.get("/stats/summary", async (req, res) => {
  try {
    const stats = await Suspect.getSuspectStats(req.hotelId);

    res.json({
      success: true,
      stats: stats,
    });
  } catch (error) {
    console.error("Get hotel suspect stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch statistics",
      message: error.message,
    });
  }
});

module.exports = router;
