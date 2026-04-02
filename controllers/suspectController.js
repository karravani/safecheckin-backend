// controllers/suspectController.js - COMPLETE WITH ACTIVITY LOGGING
const Suspect = require("../models/Suspect");
const Alert = require("../models/Alert");
const Guest = require("../models/Guest");
const Hotel = require("../models/Hotel");
const { logActivity } = require("./activityController");
const mongoose = require("mongoose");

// ========== VERIFY SUSPECT (NO TRANSACTIONS) ========== //
const verifySuspect = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { reasonForSuspicion, additionalNotes } = req.body;
    const userId = req.user._id || req.user.policeId;

    if (!reasonForSuspicion?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Reason for suspicion is required",
      });
    }

    // Fetch alert
    const alert = await Alert.findById(alertId)
      .populate("guestId")
      .populate("hotelId");

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    if (!alert.guestId) {
      return res.status(400).json({
        success: false,
        error: "Alert has no guest data",
      });
    }

    // Check existing
    const existingSuspect = await Suspect.findOne({
      guestId: alert.guestId._id,
      isActive: true,
      status: { $in: ["Active", "Under Investigation"] },
    });

    if (existingSuspect) {
      return res.status(200).json({
        success: true,
        message: "Guest already verified as suspect",
        suspect: existingSuspect,
        isNewSuspect: false,
      });
    }

    const guest = alert.guestId;
    const suspectData = {
      name: guest.name,
      phone: guest.phone,
      email: guest.email || "",
      aadhar: guest.aadhar || "",
      address: guest.address || "",
      age: guest.age || null,
      nationality: guest.nationality || "",
      roomNumber: guest.roomNumber || "",
    };

    // Create suspect
    const suspect = new Suspect({
      guestId: guest._id,
      hotelId: alert.hotelId._id,
      alertId: alert._id,
      suspectData,
      verifiedBy: {
        policeId: userId,
        name: req.user.name,
        rank: req.user.rank,
        badgeNumber: req.user.badgeNumber,
        station: req.user.station,
        verifiedAt: new Date(),
      },
      evidence: {
        reasonForSuspicion: reasonForSuspicion.trim(),
        additionalNotes: additionalNotes?.trim() || "",
      },
      status: "Active",
      associatedAlerts: [
        {
          alertId: alert._id,
          alertTitle: alert.title,
          alertType: alert.type,
          alertPriority: alert.priority,
          alertDate: alert.createdAt,
          alertStatus: alert.status,
        },
      ],
      isActive: true,
      lastUpdatedBy: {
        policeId: userId,
        name: req.user.name,
        rank: req.user.rank,
      },
    });

    await suspect.save();

    // Update alert
    alert.suspectVerification = {
      isVerifiedSuspect: true,
      suspectId: suspect._id,
      verifiedAt: new Date(),
      verifiedBy: {
        policeId: userId,
        name: req.user.name,
        rank: req.user.rank,
      },
    };

    alert.timeline.push({
      action: "Verified as Suspect",
      performedBy: {
        name: req.user.name,
        role: `Police - ${req.user.rank}`,
      },
      timestamp: new Date(),
      notes: `Verified as suspect. Reason: ${reasonForSuspicion.substring(
        0,
        100
      )}`,
    });

    await alert.save();

    // Update guest (non-critical)
    try {
      await Guest.findByIdAndUpdate(guest._id, {
        isFlagged: true,
        flagReason: `Verified as suspect: ${reasonForSuspicion.substring(
          0,
          200
        )}`,
        flaggedBy: userId,
        flaggedAt: new Date(),
        status: "flagged",
        securityLevel: "Critical",
      });
    } catch (err) {
      console.warn("Guest update failed:", err.message);
    }

    // ✅ Log suspect verification activity
    try {
      await logActivity(
        userId.toString(),
        "suspect_verified",
        "suspect",
        suspect._id.toString(),
        {
          suspectName: suspectData.name,
          guestId: guest._id.toString(),
          hotelId: alert.hotelId._id.toString(),
          alertId: alert._id.toString(),
          reasonForSuspicion: reasonForSuspicion.substring(0, 200),
          verifiedBy: req.user.name,
          rank: req.user.rank,
          station: req.user.station,
        },
        req
      );
    } catch (err) {
      console.warn("Activity logging failed:", err.message);
    }

    // Populate response
    const populatedSuspect = await Suspect.findById(suspect._id)
      .populate({
        path: "guestId",
        select: "name phone email roomNumber status",
        strictPopulate: false,
      })
      .populate({
        path: "hotelId",
        select: "name address phone",
        strictPopulate: false,
      })
      .populate({
        path: "alertId",
        select: "title type priority status createdAt",
        strictPopulate: false,
      });

    res.status(201).json({
      success: true,
      message: "Suspect verified successfully",
      suspect: populatedSuspect,
      isNewSuspect: true,
    });
  } catch (error) {
    console.error("Verify suspect error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify suspect",
      message: error.message,
    });
  }
};

// ========== GET ALL SUSPECTS ========== //
const getAllSuspects = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "all", search = "" } = req.query;

    const query = { isActive: true };

    if (status !== "all") {
      query.status = status;
    }

    if (search.trim()) {
      query.$or = [
        { "suspectData.name": new RegExp(search, "i") },
        { "suspectData.phone": new RegExp(search, "i") },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [suspects, totalCount] = await Promise.all([
      Suspect.find(query)
        .populate({
          path: "guestId",
          strictPopulate: false,
        })
        .populate({
          path: "hotelId",
          strictPopulate: false,
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Suspect.countDocuments(query),
    ]);

    // ✅ Log suspects viewing (for analytics)
    if (req.user?.policeId && page === 1) {
      try {
        await logActivity(
          req.user.policeId.toString(),
          "suspect_viewed",
          "suspect",
          "all_suspects",
          {
            suspectsCount: totalCount,
            filters: { status, search },
            viewedBy: req.user.name,
          },
          req
        );
      } catch (err) {
        console.warn("Activity logging failed:", err.message);
      }
    }

    res.json({
      success: true,
      suspects,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalSuspects: totalCount,
      },
    });
  } catch (error) {
    console.error("Get suspects error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch suspects",
      message: error.message,
    });
  }
};

// ========== GET SUSPECT BY ID ========== //
const getSuspectById = async (req, res) => {
  try {
    const suspect = await Suspect.findById(req.params.suspectId)
      .populate({
        path: "guestId",
        strictPopulate: false,
      })
      .populate({
        path: "hotelId",
        strictPopulate: false,
      });

    if (!suspect) {
      return res.status(404).json({
        success: false,
        error: "Suspect not found",
      });
    }

    // ✅ Log individual suspect viewing
    if (req.user?.policeId) {
      try {
        await logActivity(
          req.user.policeId.toString(),
          "suspect_viewed",
          "suspect",
          suspect._id.toString(),
          {
            suspectName: suspect.suspectData?.name,
            status: suspect.status,
            viewedBy: req.user.name,
          },
          req
        );
      } catch (err) {
        console.warn("Activity logging failed:", err.message);
      }
    }
    const activities = await ActivityLog.find({
      $or: [
        { targetId: suspectId },
        { "details.suspectId": suspectId },
        { "metadata.suspectId": suspectId },
      ],
      action: { $ne: "logging_failed" },
    })
      .populate("performedBy", "name badgeNumber rank role")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // ⭐ FORMAT ACTIVITIES FOR FRONTEND TIMELINE
    const formattedActivities = activities.map((activity) => ({
      id: activity._id,
      action: activity.action,
      actionReadable: formatActionReadable(activity.action),
      description: generateActivityDescription(activity),
      icon: getActivityIcon(activity.action),
      color: getActivityColor(activity.action, activity.severity),
      performedBy:
        activity.performedBy?.name || activity.details?.performedBy || "System",
      badgeNumber: activity.performedBy?.badgeNumber || null,
      rank: activity.performedBy?.rank || null,
      timestamp: activity.createdAt,
      severity: activity.severity,
      category: activity.category,
      details: activity.details,
      metadata: activity.metadata,
    }));

    // Log view activity
    await logActivity(
      req.user.policeId,
      "suspect_viewed",
      "suspect",
      suspectId,
      {
        suspectName: suspect.name,
        suspectAadhar: suspect.aadhar,
        performedBy: req.user.name,
      },
      req
    );

    res.json({
      success: true,
      data: {
        suspect,
        activities: formattedActivities,
        activityCount: formattedActivities.length,
      },
    });
  } catch (error) {
    console.error("Get suspect error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch suspect",
      message: error.message,
    });
  }
};

// ========== UPDATE SUSPECT STATUS ========== //
const updateSuspectStatus = async (req, res) => {
  try {
    const { suspectId } = req.params;
    const { status, reason } = req.body;

    const validStatuses = [
      "Active",
      "Cleared",
      "Under Investigation",
      "Arrested",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status",
        validStatuses,
      });
    }

    const suspect = await Suspect.findById(suspectId);

    if (!suspect) {
      return res.status(404).json({
        success: false,
        error: "Suspect not found",
      });
    }

    const previousStatus = suspect.status; // Save for logging

    suspect.status = status;
    suspect.lastUpdatedBy = {
      policeId: req.user._id || req.user.policeId,
      name: req.user.name,
      rank: req.user.rank,
    };

    await suspect.save();

    // ✅ Log suspect status update
    try {
      await logActivity(
        (req.user._id || req.user.policeId).toString(),
        "suspect_status_updated",
        "suspect",
        suspectId,
        {
          suspectName: suspect.suspectData?.name,
          previousStatus,
          newStatus: status,
          reason: reason || "No reason provided",
          updatedBy: req.user.name,
          rank: req.user.rank,
        },
        req
      );
    } catch (err) {
      console.warn("Activity logging failed:", err.message);
    }

    res.json({
      success: true,
      message: `Status updated to ${status}`,
      suspect,
    });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update status",
      message: error.message,
    });
  }
};

// ========== UPDATE SUSPECT NOTES ========== //
const updateSuspectNotes = async (req, res) => {
  try {
    const { suspectId } = req.params;
    const { notes, reason } = req.body;

    if (!notes?.trim() || !reason?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Notes and reason are required",
      });
    }

    const suspect = await Suspect.findById(suspectId);

    if (!suspect) {
      return res.status(404).json({
        success: false,
        error: "Suspect not found",
      });
    }

    suspect.evidence.additionalNotes = notes.trim();
    await suspect.save();

    // ✅ Log suspect notes update
    try {
      await logActivity(
        (req.user._id || req.user.policeId).toString(),
        "suspect_notes_updated",
        "suspect",
        suspectId,
        {
          suspectName: suspect.suspectData?.name,
          reason: reason.trim(),
          updatedBy: req.user.name,
          notesLength: notes.trim().length,
        },
        req
      );
    } catch (err) {
      console.warn("Activity logging failed:", err.message);
    }

    res.json({
      success: true,
      message: "Notes updated",
      suspect,
    });
  } catch (error) {
    console.error("Update notes error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update notes",
      message: error.message,
    });
  }
};

// ========== GET SUSPECTS BY HOTEL (For hotel dashboard) ========== //
const getSuspectsByHotel = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { status = "all", page = 1, limit = 20 } = req.query;

    // Verify hotel exists
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        error: "Hotel not found",
      });
    }

    // Build query
    const query = { hotelId, isActive: true };
    if (status !== "all") {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [suspects, totalCount] = await Promise.all([
      Suspect.find(query)
        .populate("guestId", "name phone email roomNumber status")
        .populate("verifiedBy.policeId", "name rank badgeNumber station")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Suspect.countDocuments(query),
    ]);

    res.json({
      success: true,
      hotelName: hotel.name,
      suspects: suspects,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalSuspects: totalCount,
        hasNext: skip + parseInt(limit) < totalCount,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Get suspects by hotel error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch hotel suspects",
      message: error.message,
    });
  }
};

// ========== GET SUSPECT STATISTICS ========== //
const getSuspectStats = async (req, res) => {
  try {
    const { hotelId = null } = req.query;

    const stats = await Suspect.getSuspectStats(
      hotelId ? mongoose.Types.ObjectId(hotelId) : null
    );

    // Get recent suspects (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSuspectsCount = await Suspect.countDocuments({
      isActive: true,
      createdAt: { $gte: sevenDaysAgo },
      ...(hotelId && { hotelId }),
    });

    res.json({
      success: true,
      stats: {
        total: stats.total,
        byStatus: stats.byStatus,
        recentlyAdded: recentSuspectsCount,
      },
    });
  } catch (error) {
    console.error("Get suspect stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch suspect statistics",
      message: error.message,
    });
  }
};

// ⭐ NEW: Get suspect activities only
const getSuspectActivities = async (req, res) => {
  try {
    const { suspectId } = req.params;
    const { page = 1, limit = 50, action, severity } = req.query;

    // Verify suspect exists
    const suspect = await Suspect.findById(suspectId);
    if (!suspect) {
      return res.status(404).json({
        success: false,
        error: "Suspect not found",
      });
    }

    // Build filter
    const filter = {
      $or: [
        { targetId: suspectId },
        { "details.suspectId": suspectId },
        { "metadata.suspectId": suspectId },
      ],
      action: { $ne: "logging_failed" },
    };

    if (action && action !== "all") filter.action = action;
    if (severity && severity !== "all") filter.severity = severity;

    const skip = (page - 1) * limit;

    const [activities, totalCount] = await Promise.all([
      ActivityLog.find(filter)
        .populate("performedBy", "name badgeNumber rank role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    // Format for frontend
    const formattedActivities = activities.map((activity) => ({
      id: activity._id,
      action: activity.action,
      actionReadable: formatActionReadable(activity.action),
      description: generateActivityDescription(activity),
      icon: getActivityIcon(activity.action),
      color: getActivityColor(activity.action, activity.severity),
      performedBy:
        activity.performedBy?.name || activity.details?.performedBy || "System",
      badgeNumber: activity.performedBy?.badgeNumber || null,
      rank: activity.performedBy?.rank || null,
      timestamp: activity.createdAt,
      severity: activity.severity,
      category: activity.category,
      details: activity.details,
    }));

    res.json({
      success: true,
      data: {
        suspectId,
        suspectName: suspect.name,
        activities: formattedActivities,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get suspect activities error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch suspect activities",
      message: error.message,
    });
  }
};

// Helper functions for activity formatting
const formatActionReadable = (action) => {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const generateActivityDescription = (activity) => {
  const { action, details } = activity;

  switch (action) {
    case "alert_acknowledged":
      return `Alert "${details.title || "Unknown"}" was acknowledged`;

    case "alert_resolved":
      return `Alert "${details.title || "Unknown"}" was resolved`;

    case "alert_cancelled":
      return `Alert "${details.title || "Unknown"}" was cancelled`;

    case "alert_status_updated":
      return details.statusChange
        ? `Alert status changed: ${details.statusChange}`
        : `Alert status updated to ${details.newStatus || "Unknown"}`;

    case "suspect_verified":
      return `Suspect verified by police`;

    case "suspect_status_updated":
      return details.action || `Suspect status updated`;

    case "suspect_notes_updated":
      return `Suspect notes updated: ${details.notes || ""}`;

    case "evidence_uploaded":
      return `Evidence uploaded: ${details.fileName || "File"}`;

    case "evidence_viewed":
      return `Evidence viewed: ${details.fileName || "File"}`;

    default:
      return details.description || formatActionReadable(action);
  }
};

const getActivityIcon = (action) => {
  const iconMap = {
    alert_acknowledged: "check-circle",
    alert_resolved: "check-circle-2",
    alert_cancelled: "x-circle",
    alert_status_updated: "arrow-right-circle",
    alert_created: "alert-triangle",
    suspect_verified: "shield-check",
    suspect_status_updated: "refresh-cw",
    suspect_notes_updated: "file-text",
    suspect_viewed: "eye",
    evidence_uploaded: "upload",
    evidence_viewed: "eye",
    evidence_approved: "check",
    evidence_rejected: "x",
  };

  return iconMap[action] || "activity";
};

const getActivityColor = (action, severity) => {
  // Priority: severity first, then action-specific
  const severityColors = {
    critical: "red",
    high: "orange",
    medium: "yellow",
    low: "green",
  };

  if (severity && severityColors[severity]) {
    return severityColors[severity];
  }

  const actionColors = {
    alert_resolved: "green",
    alert_acknowledged: "blue",
    alert_cancelled: "gray",
    alert_status_updated: "blue",
    alert_created: "orange",
    suspect_verified: "green",
    suspect_status_updated: "blue",
    evidence_uploaded: "purple",
    evidence_approved: "green",
    evidence_rejected: "red",
  };

  return actionColors[action] || "gray";
};

module.exports = {
  verifySuspect,
  getAllSuspects,
  getSuspectById,
  updateSuspectStatus,
  updateSuspectNotes,
  getSuspectsByHotel,
  getSuspectStats,
};
