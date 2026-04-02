// routes/alertRoutes.js - FIXED WITH PROPER AUTHENTICATION
const express = require("express");
const router = express.Router();
const {
  createAlert,
  getAllAlerts,
  getAlertById,
  updateAlertStatus,
  deleteAlert,
  getAlertStats,
  assignAlert,
  addTimelineEntry,
  checkGuestAlertStatus,
  markAsSuspect,
  deleteSuspect,
  getAllSuspects,
  restoreSuspect,
  getAlertActivities,
} = require("../controllers/alertController");
const { logActivity } = require("../controllers/activityController");
const { authenticateHotel, authenticatePolice } = require("../middleware/auth");
const Alert = require("../models/Alert");
const jwt = require("jsonwebtoken");

// ========== FLEXIBLE AUTHENTICATION MIDDLEWARE ========== //
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if hotel or police user
    if (decoded.hotelId) {
      req.hotelId = decoded.hotelId;
      req.user = decoded;
      req.userType = "hotel";
    } else if (decoded.policeId) {
      req.policeId = decoded.policeId;
      req.user = decoded;
      req.userType = "police";
    } else {
      return res.status(401).json({
        success: false,
        error: "Invalid token type",
      });
    }

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

// ========== CREATE ALERT (Hotel Only) ========== //
router.post("/", authenticateUser, async (req, res) => {
  try {
    if (req.userType !== "hotel") {
      return res.status(403).json({
        success: false,
        error: "Only hotels can create alerts",
      });
    }

    const {
      guestId,
      type,
      priority,
      title,
      description,
      location,
      suspectData,
    } = req.body;

    // Validation
    if (!guestId || !type || !priority || !title || !description) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    const alert = new Alert({
      guestId,
      hotelId: req.hotelId,
      type,
      priority,
      title,
      description,
      location: location || {},
      status: "Pending",
      isActive: true,
      suspectData,
      timeline: [
        {
          action: "Alert Created",
          performedBy: {
            name: req.user.name || "Hotel Staff",
            role: "Hotel Staff",
          },
          timestamp: new Date(),
          notes: "Alert created by hotel",
        },
      ],
    });

    await alert.save();

    // Log activity
    try {
      await logActivity(
        req.hotelId.toString(),
        "alert_created",
        "alert",
        alert._id.toString(),
        {
          type,
          priority,
          guestId: guestId.toString(),
        },
        req
      );
    } catch (logError) {
      console.warn("Activity logging failed:", logError.message);
    }

    res.status(201).json({
      success: true,
      message: "Alert created successfully",
      alert: {
        id: alert._id,
        _id: alert._id,
        type: alert.type,
        priority: alert.priority,
        title: alert.title,
        status: alert.status,
        createdAt: alert.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Create alert error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create alert",
      message: error.message,
    });
  }
});

// ========== GET ALL ALERTS (Both Hotel & Police) ========== //
router.get("/", authenticateUser, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      status = "all",
      priority = "all",
      type = "all",
      sortBy = "createdAt",
      sortOrder = "desc",
      search = "",
    } = req.query;

    console.log("📍 Fetching alerts for:", req.userType, {
      hotelId: req.hotelId,
      policeId: req.policeId,
    });

    // Build query
    const query = {};

    // If hotel, only show their alerts
    if (req.userType === "hotel") {
      query.hotelId = req.hotelId;
    }
    // Police can see all alerts

    if (status !== "all") {
      query.status = status.charAt(0).toUpperCase() + status.slice(1);
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

    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch alerts with safe population
    let alerts = [];
    let totalCount = 0;

    try {
      alerts = await Alert.find(query)
        .populate({
          path: "guestId",
          select: "name phone email roomNumber status aadhar",
          strictPopulate: false,
        })
        .populate({
          path: "hotelId",
          select: "name address phone email",
          strictPopulate: false,
        })
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      totalCount = await Alert.countDocuments(query);
    } catch (populateError) {
      console.warn(
        "Population error, fetching without populate:",
        populateError.message
      );
      alerts = await Alert.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      totalCount = await Alert.countDocuments(query);
    }

    console.log("✅ Alerts fetched:", {
      count: alerts.length,
      total: totalCount,
      userType: req.userType,
    });

    // Log activity
    try {
      const userId = req.hotelId?.toString() || req.policeId?.toString();
      await logActivity(
        userId,
        "alerts_viewed",
        "alert",
        "list_view",
        {
          userType: req.userType,
          filters: { status, priority, type },
          resultCount: alerts.length,
        },
        req
      );
    } catch (logError) {
      console.warn("Activity logging failed:", logError.message);
    }

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
        guest: alert.guestId
          ? {
              id: alert.guestId._id || alert.guestId,
              name: alert.guestId.name,
              phone: alert.guestId.phone,
              roomNumber: alert.guestId.roomNumber,
              email: alert.guestId.email,
            }
          : null,
        hotel: alert.hotelId
          ? {
              id: alert.hotelId._id || alert.hotelId,
              name: alert.hotelId.name,
              address: alert.hotelId.address,
              phone: alert.hotelId.phone,
            }
          : null,
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt,
        timeline: alert.timeline || [],
        isActive: alert.isActive,
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
router.get("/:id", authenticateUser, async (req, res) => {
  try {
    let alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    // Check access
    if (
      req.userType === "hotel" &&
      alert.hotelId.toString() !== req.hotelId.toString()
    ) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this alert",
      });
    }

    // Populate
    try {
      alert = await Alert.findById(req.params.id)
        .populate({
          path: "guestId",
          select: "name phone email roomNumber status aadhar",
          strictPopulate: false,
        })
        .populate({
          path: "hotelId",
          select: "name address phone email",
          strictPopulate: false,
        });
    } catch (populateError) {
      console.warn("Population failed:", populateError.message);
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
        guest: alert.guestId,
        hotel: alert.hotelId,
        timeline: alert.timeline || [],
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt,
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
router.put("/:id/status", authenticateUser, async (req, res) => {
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
      });
    }

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    // Check access
    if (
      req.userType === "hotel" &&
      alert.hotelId.toString() !== req.hotelId.toString()
    ) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this alert",
      });
    }

    const previousStatus = alert.status;
    alert.status = status;

    if (!alert.timeline) {
      alert.timeline = [];
    }

    alert.timeline.push({
      action: status,
      performedBy: {
        name:
          req.user.name ||
          (req.userType === "hotel" ? "Hotel Staff" : "Police Officer"),
        role:
          req.userType === "hotel"
            ? "Hotel Staff"
            : `Police - ${req.user.rank || "Officer"}`,
      },
      timestamp: new Date(),
      notes: notes || `Status changed to ${status}`,
    });

    if (status === "Resolved") {
      alert.resolution = {
        summary: notes || "Resolved",
        resolvedBy: {
          name:
            req.user.name ||
            (req.userType === "hotel" ? "Hotel Staff" : "Police Officer"),
          role:
            req.userType === "hotel"
              ? "Hotel Staff"
              : `Police - ${req.user.rank || "Officer"}`,
        },
        resolvedAt: new Date(),
      };
      alert.isActive = false;
    }

    await alert.save();

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

// ========== DELETE ALERT (Hotel Only) ========== //
router.delete("/:id", authenticateUser, async (req, res) => {
  try {
    if (req.userType !== "hotel") {
      return res.status(403).json({
        success: false,
        error: "Only hotels can delete alerts",
      });
    }

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    if (alert.hotelId.toString() !== req.hotelId.toString()) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this alert",
      });
    }

    await Alert.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Alert deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete alert error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete alert",
      message: error.message,
    });
  }
});

// ========== GET STATS ========== //
router.get("/stats/summary", authenticateUser, async (req, res) => {
  try {
    const query = req.userType === "hotel" ? { hotelId: req.hotelId } : {};

    const stats = await Alert.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalAlerts = await Alert.countDocuments(query);

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

// ========== FILTER BY PRIORITY ========== //
router.get("/filter/priority/:priority", authenticateUser, async (req, res) => {
  try {
    const { priority } = req.params;
    const { status = "active", limit = 50 } = req.query;

    const query = {
      priority:
        priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase(),
    };

    if (req.userType === "hotel") {
      query.hotelId = req.hotelId;
    }

    if (status === "active") {
      query.isActive = true;
    } else if (status === "resolved") {
      query.status = "Resolved";
    }

    const alerts = await Alert.find(query)
      .populate("guestId", "name roomNumber phone")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      priority,
      alerts: alerts.map((alert) => ({
        id: alert._id,
        title: alert.title,
        description: alert.description,
        type: alert.type,
        priority: alert.priority,
        status: alert.status,
        location: alert.location,
        guest: alert.guestId,
        createdAt: alert.createdAt,
      })),
      totalFound: alerts.length,
    });
  } catch (error) {
    console.error("Filter alerts by priority error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to filter alerts",
      message: error.message,
    });
  }
});
router.get("/:id/activities", authenticatePolice, getAlertActivities);

// ========== CHECK GUEST ALERT STATUS ========== //
router.get("/guest/:guestId/status", authenticateUser, async (req, res) => {
  try {
    const { guestId } = req.params;

    const query = { guestId };
    if (req.userType === "hotel") {
      query.hotelId = req.hotelId;
    }

    const alerts = await Alert.find(query).select(
      "status priority type createdAt"
    );

    const hasActiveAlerts = alerts.some((alert) => alert.isActive);
    const hasCriticalAlerts = alerts.some(
      (alert) => alert.priority === "Critical" && alert.isActive
    );

    res.json({
      success: true,
      guestId,
      hasAlerts: alerts.length > 0,
      hasActiveAlerts,
      hasCriticalAlerts,
      totalAlerts: alerts.length,
      activeAlerts: alerts.filter((a) => a.isActive).length,
      alerts: alerts.map((a) => ({
        id: a._id,
        status: a.status,
        priority: a.priority,
        type: a.type,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("Check guest alert status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check guest alert status",
      message: error.message,
    });
  }
});

module.exports = router;
