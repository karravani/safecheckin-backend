// routes/policeAlertRoutes.js - FIXED VERSION (NO 500 ERRORS)
const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const { authenticatePolice } = require("../middleware/policeAuth");
const { logActivity } = require("../controllers/activityController");

// ========== ALL ROUTES REQUIRE AUTHENTICATION ========== //
router.use(authenticatePolice);

// ========== GET ALL ALERTS (FIXED) ========== //
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "all",
      priority = "all",
      type = "all",
      sortBy = "createdAt",
      sortOrder = "desc",
      search = "",
    } = req.query;

    console.log("📍 Fetching alerts with filters:", {
      status,
      priority,
      type,
      search,
    });

    // ========== BUILD QUERY ========== //
    const query = {};

    if (status !== "all") {
      query.status = status;
    }

    if (priority !== "all") {
      query.priority =
        priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase();
    }

    if (type !== "all") {
      query.type = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // ========== SORTING ========== //
    const sort = {};
    if (sortBy === "priority") {
      sort.priority = sortOrder === "asc" ? 1 : -1;
      sort.createdAt = -1;
    } else {
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;
    }

    // ========== PAGINATION ========== //
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ========== FETCH WITH ERROR HANDLING ========== //
    let alerts = [];
    let totalCount = 0;

    try {
      alerts = await Alert.find(query)
        .populate({
          path: "guestId",
          select:
            "name phone email roomNumber status aadhar age nationality address",
          strictPopulate: false, // ⭐ IMPORTANT: Don't fail if reference missing
        })
        .populate({
          path: "hotelId",
          select: "name address phone email ownerName",
          strictPopulate: false, // ⭐ IMPORTANT: Don't fail if reference missing
        })
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      totalCount = await Alert.countDocuments(query);

      console.log("✅ Alerts fetched successfully:", {
        count: alerts.length,
        total: totalCount,
      });
    } catch (populateError) {
      console.error(
        "⚠️ Population error (continuing without populate):",
        populateError.message
      );

      // Fallback: Get alerts without populate
      alerts = await Alert.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      totalCount = await Alert.countDocuments(query);
    }

    // ========== LOG ACTIVITY ========== //
    try {
      await logActivity(
        req.user._id?.toString() || req.user.policeId?.toString(),
        "alerts_viewed",
        "alert",
        "list_view",
        {
          filters: { status, priority, type },
          resultCount: alerts.length,
          totalCount,
        },
        req
      );
    } catch (logError) {
      console.warn("Activity logging failed:", logError.message);
    }

    // ========== RESPONSE ========== //
    res.json({
      success: true,
      alerts: alerts.map((alert) => ({
        _id: alert._id,
        id: alert._id,
        type: alert.type,
        priority: alert.priority,
        title: alert.title,
        description: alert.description,
        status: alert.status,
        location: alert.location,
        guestId: alert.guestId || null,
        hotelId: alert.hotelId || null,
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt,
        timeline: alert.timeline || [],
        suspectVerification: alert.suspectVerification || null,
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalAlerts: totalCount,
        hasNext: skip + parseInt(limit) < totalCount,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("❌ Get alerts error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch alerts",
      message: error.message,
    });
  }
});

// ========== GET ALERT BY ID ========== //
router.get("/:id", async (req, res) => {
  try {
    let alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    // ⭐ SAFE POPULATE WITH ERROR HANDLING
    try {
      alert = await Alert.findById(req.params.id)
        .populate({
          path: "guestId",
          select:
            "name phone email roomNumber status aadhar age nationality address",
          strictPopulate: false,
        })
        .populate({
          path: "hotelId",
          select: "name address phone email ownerName",
          strictPopulate: false,
        });
    } catch (populateError) {
      console.warn("Population failed for detail view:", populateError.message);
      // Continue with unpopulated alert
    }

    res.json({
      success: true,
      alert: {
        _id: alert._id,
        id: alert._id,
        type: alert.type,
        priority: alert.priority,
        title: alert.title,
        description: alert.description,
        status: alert.status,
        location: alert.location,
        guestId: alert.guestId || null,
        hotelId: alert.hotelId || null,
        timeline: alert.timeline || [],
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt,
        suspectVerification: alert.suspectVerification || null,
      },
    });
  } catch (error) {
    console.error("❌ Get alert by ID error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch alert",
      message: error.message,
    });
  }
});

// ========== UPDATE ALERT STATUS ========== //
router.put("/:id/status", async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required",
      });
    }

    const validStatuses = [
      "Pending",
      "Acknowledged",
      "In Progress",
      "Resolved",
      "Cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status",
        validStatuses,
      });
    }

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    const previousStatus = alert.status;

    // ========== UPDATE ========== //
    alert.status = status;

    if (!alert.timeline) {
      alert.timeline = [];
    }

    alert.timeline.push({
      action: status,
      performedBy: {
        name: req.user.name || "Officer",
        role: `Police - ${req.user.rank || "Officer"}`,
      },
      timestamp: new Date(),
      notes: notes || `Status changed to ${status}`,
    });

    if (status === "Resolved") {
      alert.resolution = {
        summary: notes || "Resolved by police",
        resolvedBy: {
          name: req.user.name || "Officer",
          role: `Police - ${req.user.rank || "Officer"}`,
        },
        resolvedAt: new Date(),
      };
    }

    await alert.save();

    // ========== LOG ACTIVITY ========== //
    try {
      await logActivity(
        req.user._id?.toString() || req.user.policeId?.toString(),
        "alert_status_updated",
        "alert",
        alert._id.toString(),
        {
          previousStatus,
          newStatus: status,
          notes,
        },
        req
      );
    } catch (logError) {
      console.warn("Activity logging failed:", logError.message);
    }

    res.json({
      success: true,
      message: `Alert status updated to ${status}`,
      alert: {
        _id: alert._id,
        status: alert.status,
        timeline: alert.timeline,
        resolution: alert.resolution,
      },
    });
  } catch (error) {
    console.error("❌ Update status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update alert status",
      message: error.message,
    });
  }
});

// ========== GET STATS ========== //
router.get("/stats/summary", async (req, res) => {
  try {
    const stats = await Alert.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalAlerts = await Alert.countDocuments({});

    res.json({
      success: true,
      stats: {
        total: totalAlerts,
        byStatus: stats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("❌ Stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch statistics",
      message: error.message,
    });
  }
});

module.exports = router;
