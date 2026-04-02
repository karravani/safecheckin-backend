// controllers/alertController.js - COMPLETE WITH ACTIVITY LOGGING & SUSPECT MANAGEMENT
const Alert = require("../models/Alert");
const Guest = require("../models/Guest");
const Hotel = require("../models/Hotel");
const ActivityLog = require("../models/ActivityLog");
const { logActivity } = require("./activityController");
const mongoose = require("mongoose");

// ========== MARK AS SUSPECT ========== //
const markAsSuspect = async (req, res) => {
  try {
    const { alertId } = req.params;

    const alert = await Alert.findById(alertId).populate("guestId");

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    const suspectId = `SUSPECT_${alert.guestId._id}_${Date.now()}`;

    const suspectBackup = {
      name: alert.guestId.name,
      phone: alert.guestId.phone,
      aadhar: alert.guestId.aadhar,
      vehicle: alert.guestId.vehicle || "",
      email: alert.guestId.email || "",
      address: alert.guestId.address || "",
      age: alert.guestId.age || null,
      occupation: alert.guestId.occupation || "",
    };

    alert.suspectDetails = {
      isSuspect: true,
      suspectId: suspectId,
      suspectDeleted: false,
      suspectDeletedAt: null,
      suspectDeletedBy: null,
      deletionReason: null,
      suspectBackup: suspectBackup,
    };

    await alert.save();

    // ✅ Log suspect creation activity
    await logActivity(
      req.user?.policeId || req.user?._id || "system",
      "suspect_added",
      "suspect",
      suspectId,
      {
        alertId: alert._id,
        suspectName: alert.guestId.name,
        guestId: alert.guestId._id,
        hotelId: alert.hotelId,
        actionTaken: "marked_as_suspect",
        performedBy: req.user?.name || "Police Officer",
      },
      req
    );

    console.log("✅ Guest marked as suspect:", suspectId);

    res.json({
      success: true,
      message: "Guest marked as suspect successfully",
      suspectId: suspectId,
      alert: alert,
    });
  } catch (error) {
    console.error("Mark as suspect error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark as suspect",
      message: error.message,
    });
  }
};

// ========== DELETE SUSPECT (SOFT DELETE) ========== //
const deleteSuspect = async (req, res) => {
  try {
    const { suspectId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: "Deletion reason is required",
      });
    }

    const suspectAlert = await Alert.findOne({
      "suspectDetails.suspectId": suspectId,
      "suspectDetails.isSuspect": true,
    }).populate("guestId");

    if (!suspectAlert) {
      return res.status(404).json({
        success: false,
        error: "Suspect not found",
      });
    }

    const deletedBy = {
      name: req.user?.name || "Police Officer",
      role: req.user?.policeRole || "police",
      badgeNumber: req.user?.badgeNumber || "",
      policeId: req.user?.policeId?.toString() || "",
    };

    const result = await Alert.softDeleteSuspect(
      suspectId,
      deletedBy,
      reason.trim()
    );

    // ✅ Log suspect deletion activity
    await logActivity(
      req.user?.policeId?.toString() || "system",
      "suspect_deleted",
      "suspect",
      suspectId,
      {
        suspectName:
          suspectAlert.suspectDetails?.suspectBackup?.name ||
          suspectAlert.guestId?.name,
        deletionReason: reason.trim(),
        deletedBy: deletedBy.name,
        alertsAffected: result.modifiedCount,
        guestId: suspectAlert.guestId?._id,
        hotelId: suspectAlert.hotelId,
      },
      req
    );

    console.log(`✅ Suspect deleted: ${suspectId}`);

    res.json({
      success: true,
      message: "Suspect deleted successfully",
      deletedSuspect: {
        suspectId: suspectId,
        name:
          suspectAlert.suspectDetails?.suspectBackup?.name ||
          suspectAlert.guestId?.name,
        deletedAt: new Date(),
        deletedBy: deletedBy.name,
        reason: reason.trim(),
        alertsAffected: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Delete suspect error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete suspect",
      message: error.message,
    });
  }
};

// ========== GET ALL SUSPECTS ========== //
const getAllSuspects = async (req, res) => {
  try {
    const { includeDeleted = "false", page = 1, limit = 20 } = req.query;
    const showDeleted = includeDeleted === "true";

    if (showDeleted && req.user?.policeRole !== "admin_police") {
      return res.status(403).json({
        success: false,
        error: "Admin police role required to view deleted suspects.",
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let suspects;
    if (showDeleted) {
      suspects = await Alert.getAllSuspectsForAdmin();
    } else {
      suspects = await Alert.getActiveSuspects();
    }

    const transformedSuspects = suspects
      .slice(skip, skip + parseInt(limit))
      .map((alert) => {
        const guestData =
          alert.guestId || alert.suspectDetails?.suspectBackup || {};
        const suspectData = alert.suspectDetails || {};

        return {
          id: suspectData.suspectId || alert._id,
          name: guestData.name || "Unknown",
          phone: guestData.phone || "Not Available",
          dateAdded: alert.createdAt,
          isSuspect: suspectData.isSuspect || false,
          isDeleted: suspectData.suspectDeleted || false,
          alertStatus: alert.status,
          alertPriority: alert.priority,
        };
      });

    const totalCount = suspects.length;

    res.json({
      success: true,
      data: {
        suspects: transformedSuspects,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
        },
      },
    });
  } catch (error) {
    console.error("Get all suspects error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch suspects",
    });
  }
};

// ========== RESTORE SUSPECT ========== //
const restoreSuspect = async (req, res) => {
  try {
    if (req.user?.policeRole !== "admin_police") {
      return res.status(403).json({
        success: false,
        error: "Admin police role required.",
      });
    }

    const { suspectId } = req.params;

    const suspectAlert = await Alert.findOne({
      "suspectDetails.suspectId": suspectId,
      "suspectDetails.suspectDeleted": true,
    });

    if (!suspectAlert) {
      return res.status(404).json({
        success: false,
        error: "Deleted suspect not found",
      });
    }

    const result = await Alert.restoreSuspect(suspectId);

    // ✅ Log suspect restoration
    await logActivity(
      req.user.policeId.toString(),
      "suspect_updated",
      "suspect",
      suspectId,
      {
        action: "restored",
        suspectName: suspectAlert.suspectDetails?.suspectBackup?.name,
        restoredBy: req.user.name,
        alertsAffected: result.modifiedCount,
      },
      req
    );

    console.log(`✅ Suspect restored: ${suspectId}`);

    res.json({
      success: true,
      message: "Suspect restored successfully",
    });
  } catch (error) {
    console.error("Restore suspect error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to restore suspect",
    });
  }
};

// ========== CREATE ALERT WITH ENHANCED VALIDATION ========== //
const createAlert = async (req, res) => {
  try {
    const { guestId, type, priority, title, description, location } = req.body;

    // Validation
    if (!guestId || !type || !priority || !title) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: guestId, type, priority, title",
      });
    }

    // Get guest details
    const guest = await Guest.findById(guestId);
    if (!guest) {
      return res.status(404).json({
        success: false,
        error: "Guest not found",
      });
    }

    // ⭐ NEW: Check for existing unresolved alerts
    const existingUnresolvedAlerts = await Alert.find({
      guestId: guestId,
      hotelId: req.hotelId,
      status: {
        $nin: ["Resolved", "Cancelled"],
      },
    }).populate("guestId", "name roomNumber phone");

    if (existingUnresolvedAlerts.length > 0) {
      // ✅ Log blocked alert creation
      await logActivity(
        req.user.id.toString(),
        "alert_creation_blocked",
        "alert",
        `blocked_${guestId}`,
        {
          reason: "existing_unresolved_alerts",
          guestName: guest.name,
          guestId: guestId,
          existingAlertsCount: existingUnresolvedAlerts.length,
          attemptedAlert: {
            type,
            priority,
            title: title.trim(),
          },
          hotelId: req.hotelId,
        },
        req
      );

      return res.status(409).json({
        success: false,
        error: "Cannot create new alert",
        message: `Guest ${guest.name} already has ${existingUnresolvedAlerts.length} unresolved alert(s).`,
        existingAlerts: existingUnresolvedAlerts.map((alert) => ({
          id: alert._id,
          title: alert.title,
          status: alert.status,
          priority: alert.priority,
        })),
      });
    }

    // Get hotel details
    const hotel = await Hotel.findById(req.hotelId);

    // Create alert
    const alert = new Alert({
      guestId,
      hotelId: req.hotelId,
      type,
      priority:
        priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase(),
      title: title.trim(),
      description: description?.trim() || "",
      status: "Pending",
      location: {
        roomNumber: location?.roomNumber || guest.roomNumber || "Unknown",
        floor: location?.floor,
        building: location?.building,
      },
      guest: {
        id: guest._id,
        name: guest.name,
        roomNumber: guest.roomNumber,
        phone: guest.phone,
        email: guest.email,
      },
      hotel: hotel
        ? {
            id: hotel._id,
            name: hotel.name,
            address: hotel.address,
            phone: hotel.phone,
          }
        : undefined,
      timeline: [
        {
          action: "Alert Created",
          performedBy: {
            name: hotel?.name || "Hotel Staff",
            role: "Hotel",
          },
          timestamp: new Date(),
          notes: `Alert created: ${title}`,
        },
      ],
      suspectDetails: {
        isSuspect: false,
        suspectId: null,
        suspectDeleted: false,
      },
    });

    await alert.save();

    // ⭐ LOG ACTIVITY - Alert Created
    await logActivity(
      req.user.id.toString(),
      "alert_created",
      "alert",
      alert._id.toString(),
      {
        alertId: alert._id.toString(),
        suspectId: guestId.toString(),
        guestId: guestId.toString(),
        guestName: guest.name,
        priority: alert.priority,
        type: alert.type,
        title: alert.title,
        status: alert.status,
        hotelId: req.hotelId.toString(),
        hotelName: hotel?.name,
        roomNumber: guest.roomNumber,
      },
      req
    );

    console.log("✅ Alert created and logged:", alert._id);

    res.status(201).json({
      success: true,
      message: "Alert created successfully",
      alert,
    });
  } catch (error) {
    console.error("Create alert error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create alert",
      message: error.message,
    });
  }
};

// Update alert status with activity logging
const updateAlertStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

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
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const alert = await Alert.findById(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    // Store previous status for activity log
    const previousStatus = alert.status;
    const previousStatusUpdatedAt = alert.statusUpdatedAt;

    // Update alert
    alert.status = status;
    alert.statusUpdatedAt = new Date();

    // Add to timeline
    alert.timeline.push({
      action: `Status Updated to ${status}`,
      performedBy: {
        userId: req.user?.policeId || req.user?.id,
        name: req.user?.name || "Police Officer",
        role: req.user?.policeRole || "Police",
      },
      timestamp: new Date(),
      notes: notes || `Status changed from ${previousStatus} to ${status}`,
    });

    await alert.save();

    // ⭐ LOG ACTIVITY - Status Update
    await logActivity(
      (req.user?.policeId || req.user?.id).toString(),
      "alert_status_updated",
      "alert",
      alert._id.toString(),
      {
        alertId: alert._id.toString(),
        suspectId: alert.guestId.toString(),
        guestId: alert.guestId.toString(),
        guestName: alert.guest?.name,
        previousStatus,
        newStatus: status,
        statusChange: `${previousStatus} → ${status}`,
        updatedBy: req.user?.name || "Police Officer",
        notes: notes || "",
        priority: alert.priority,
        type: alert.type,
        title: alert.title,
      },
      req
    );

    // ⭐ LOG SPECIFIC STATUS ACTIONS
    if (status === "Acknowledged") {
      await logActivity(
        (req.user?.policeId || req.user?.id).toString(),
        "alert_acknowledged",
        "alert",
        alert._id.toString(),
        {
          alertId: alert._id.toString(),
          suspectId: alert.guestId.toString(),
          guestName: alert.guest?.name,
          acknowledgedBy: req.user?.name,
          acknowledgedAt: new Date(),
        },
        req
      );
    } else if (status === "Resolved") {
      await logActivity(
        (req.user?.policeId || req.user?.id).toString(),
        "alert_resolved",
        "alert",
        alert._id.toString(),
        {
          alertId: alert._id.toString(),
          suspectId: alert.guestId.toString(),
          guestName: alert.guest?.name,
          resolvedBy: req.user?.name,
          resolvedAt: new Date(),
          timeToResolve: previousStatusUpdatedAt
            ? Math.floor((new Date() - previousStatusUpdatedAt) / 1000 / 60) // minutes
            : null,
        },
        req
      );
    } else if (status === "Cancelled") {
      await logActivity(
        (req.user?.policeId || req.user?.id).toString(),
        "alert_cancelled",
        "alert",
        alert._id.toString(),
        {
          alertId: alert._id.toString(),
          suspectId: alert.guestId.toString(),
          guestName: alert.guest?.name,
          cancelledBy: req.user?.name,
          cancelledAt: new Date(),
          reason: notes || "No reason provided",
        },
        req
      );
    }

    // ⭐ If alert has suspect details, log to suspect activities too
    if (alert.suspectDetails?.isSuspect && alert.suspectDetails?.suspectId) {
      await logActivity(
        (req.user?.policeId || req.user?.id).toString(),
        "suspect_status_updated",
        "suspect",
        alert.suspectDetails.suspectId,
        {
          relatedAlert: alert._id.toString(),
          alertTitle: alert.title,
          statusChange: `${previousStatus} → ${status}`,
          action: `Related alert status updated to ${status}`,
          performedBy: req.user?.name,
          notes: notes || "",
        },
        req
      );
    }

    console.log(`✅ Alert status updated: ${previousStatus} → ${status}`);

    res.json({
      success: true,
      message: "Alert status updated successfully",
      alert,
      changes: {
        previousStatus,
        newStatus: status,
        updatedBy: req.user?.name,
      },
    });
  } catch (error) {
    console.error("Update alert status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update alert status",
      message: error.message,
    });
  }
};

// ========== GET ALERT ACTIVITIES (FOR SUSPECT PROFILE) ========== //
const getAlertActivities = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    const alert = await Alert.findById(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    // Get activities from ActivityLog for this alert
    const activities = await ActivityLog.find({
      $or: [{ targetId: id }, { "details.alertId": id }],
      action: { $ne: "logging_failed" },
    })
      .populate("performedBy", "name badgeNumber rank")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    // Format activities for display
    const formattedActivities = activities.map((activity) => ({
      _id: activity._id,
      action: activity.action,
      description: formatActivityDescription(activity),
      performedBy: activity.performedBy?.name || "Unknown",
      performedByBadge: activity.performedBy?.badgeNumber,
      timestamp: activity.createdAt,
      details: activity.details,
      severity: activity.severity,
    }));

    res.json({
      success: true,
      data: {
        alertId: id,
        activities: formattedActivities,
        count: formattedActivities.length,
      },
    });
  } catch (error) {
    console.error("Get alert activities error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch alert activities",
      message: error.message,
    });
  }
};

// Helper function to format activity descriptions
function formatActivityDescription(activity) {
  switch (activity.action) {
    case "alert_created":
      return `Alert created: ${activity.details?.title || "New alert"}`;
    case "alert_status_updated":
      return `Status updated to ${activity.details?.newStatus || "Unknown"}`;
    case "alert_acknowledged":
      return `Alert acknowledged`;
    case "alert_resolved":
      return `Alert resolved`;
    case "alert_cancelled":
      return `Alert cancelled: ${activity.details?.reason || "No reason"}`;
    case "alert_assigned":
      return `Assigned to ${activity.details?.assignedTo || "Officer"}`;
    default:
      return activity.action
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

// Assign alert to officer with activity logging
const assignAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { officerId, officerName, officerRank, notes } = req.body;

    if (!officerId || !officerName) {
      return res.status(400).json({
        success: false,
        error: "Officer ID and name are required",
      });
    }

    const alert = await Alert.findById(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    // Store previous assignment
    const previousAssignment = alert.assignedTo;

    // Update assignment
    alert.assignedTo = {
      userId: officerId,
      name: officerName,
      role: officerRank || "Police Officer",
    };

    // Add to timeline
    alert.timeline.push({
      action: "Alert Assigned",
      performedBy: {
        userId: req.user?.policeId || req.user?.id,
        name: req.user?.name || "Admin",
        role: req.user?.policeRole || "Police",
      },
      timestamp: new Date(),
      notes: notes || `Alert assigned to ${officerName}`,
    });

    await alert.save();

    // ⭐ LOG ACTIVITY - Alert Assignment
    await logActivity(
      (req.user?.policeId || req.user?.id).toString(),
      "alert_assigned",
      "alert",
      alert._id.toString(),
      {
        alertId: alert._id.toString(),
        suspectId: alert.guestId.toString(),
        guestName: alert.guest?.name,
        assignedTo: officerName,
        assignedToId: officerId,
        assignedBy: req.user?.name,
        previousAssignment: previousAssignment?.name || "Unassigned",
        priority: alert.priority,
        type: alert.type,
      },
      req
    );

    console.log(`✅ Alert assigned to ${officerName}`);

    res.json({
      success: true,
      message: "Alert assigned successfully",
      alert,
    });
  } catch (error) {
    console.error("Assign alert error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to assign alert",
      message: error.message,
    });
  }
};

// Add timeline entry with activity logging
const addTimelineEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: "Action is required",
      });
    }

    const alert = await Alert.findById(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    // Add timeline entry
    const timelineEntry = {
      action,
      performedBy: {
        userId: req.user?.policeId || req.user?.id,
        name: req.user?.name || "Officer",
        role: req.user?.policeRole || "Police",
      },
      timestamp: new Date(),
      notes: notes || "",
    };

    alert.timeline.push(timelineEntry);
    await alert.save();

    // ⭐ LOG ACTIVITY - Timeline Entry Added
    await logActivity(
      (req.user?.policeId || req.user?.id).toString(),
      "alert_updated",
      "alert",
      alert._id.toString(),
      {
        alertId: alert._id.toString(),
        suspectId: alert.guestId.toString(),
        guestName: alert.guest?.name,
        updateType: "timeline_entry",
        action,
        notes,
        updatedBy: req.user?.name,
      },
      req
    );

    res.json({
      success: true,
      message: "Timeline entry added successfully",
      timeline: alert.timeline,
    });
  } catch (error) {
    console.error("Add timeline entry error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add timeline entry",
      message: error.message,
    });
  }
};

// Delete alert with activity logging
const deleteAlert = async (req, res) => {
  try {
    const { id } = req.params;

    const alert = await Alert.findById(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    // Store alert data before deletion
    const alertData = {
      alertId: alert._id.toString(),
      suspectId: alert.guestId.toString(),
      guestName: alert.guest?.name,
      title: alert.title,
      type: alert.type,
      priority: alert.priority,
      status: alert.status,
    };

    await Alert.findByIdAndDelete(id);

    // ⭐ LOG ACTIVITY - Alert Deleted
    await logActivity(
      (req.user?.policeId || req.user?.id || req.user?.hotelId).toString(),
      "alert_removed",
      "alert",
      id,
      {
        ...alertData,
        deletedBy: req.user?.name || "User",
        deletedAt: new Date(),
      },
      req
    );

    console.log(`✅ Alert deleted: ${id}`);

    res.json({
      success: true,
      message: "Alert deleted successfully",
    });
  } catch (error) {
    console.error("Delete alert error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete alert",
      message: error.message,
    });
  }
};

// Get all alerts with optional filters
const getAllAlerts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      type,
      guestId,
      search,
    } = req.query;

    // Build filter
    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (priority && priority !== "all") filter.priority = priority;
    if (type && type !== "all") filter.type = type;
    if (guestId) filter.guestId = guestId;

    // Search in title or description
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "guest.name": { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [alerts, total] = await Promise.all([
      Alert.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Alert.countDocuments(filter),
    ]);

    res.json({
      success: true,
      alerts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get alerts error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch alerts",
      message: error.message,
    });
  }
};

// Get alert by ID
const getAlertById = async (req, res) => {
  try {
    const { id } = req.params;

    const alert = await Alert.findById(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    res.json({
      success: true,
      alert,
    });
  } catch (error) {
    console.error("Get alert by ID error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch alert",
      message: error.message,
    });
  }
};

// Get alerts by guest/suspect ID
const getAlertsByGuest = async (req, res) => {
  try {
    const { guestId } = req.params;

    const alerts = await Alert.find({ guestId }).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      alerts,
      count: alerts.length,
    });
  } catch (error) {
    console.error("Get alerts by guest error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch alerts",
      message: error.message,
    });
  }
};

// Check if guest has active alerts
const checkGuestAlertStatus = async (req, res) => {
  try {
    const { guestId } = req.params;

    const activeAlerts = await Alert.find({
      guestId,
      status: { $nin: ["Resolved", "Cancelled"] },
    }).lean();

    res.json({
      success: true,
      hasActiveAlerts: activeAlerts.length > 0,
      activeAlertCount: activeAlerts.length,
      alerts: activeAlerts,
    });
  } catch (error) {
    console.error("Check guest alert status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check alert status",
      message: error.message,
    });
  }
};

// Get alert statistics
const getAlertStats = async (req, res) => {
  try {
    const stats = await Alert.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] },
          },
          acknowledged: {
            $sum: { $cond: [{ $eq: ["$status", "Acknowledged"] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ["$status", "In Progress"] }, 1, 0] },
          },
          resolved: {
            $sum: { $cond: [{ $eq: ["$status", "Resolved"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] },
          },
          critical: {
            $sum: { $cond: [{ $eq: ["$priority", "Critical"] }, 1, 0] },
          },
          high: {
            $sum: { $cond: [{ $eq: ["$priority", "High"] }, 1, 0] },
          },
          medium: {
            $sum: { $cond: [{ $eq: ["$priority", "Medium"] }, 1, 0] },
          },
          low: {
            $sum: { $cond: [{ $eq: ["$priority", "Low"] }, 1, 0] },
          },
        },
      },
    ]);

    res.json({
      success: true,
      stats: stats[0] || {
        total: 0,
        pending: 0,
        acknowledged: 0,
        inProgress: 0,
        resolved: 0,
        cancelled: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    });
  } catch (error) {
    console.error("Get alert stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch alert statistics",
      message: error.message,
    });
  }
};

module.exports = {
  createAlert,
  getAllAlerts,
  getAlertById,
  updateAlertStatus,
  deleteAlert,
  getAlertStats,
  assignAlert,
  addTimelineEntry,
  checkGuestAlertStatus,
  getAlertsByGuest,
  getAlertActivities, // ⭐ NEW: For fetching alert activities
  // ⭐ SUSPECT MANAGEMENT FUNCTIONS
  markAsSuspect,
  deleteSuspect,
  getAllSuspects,
  restoreSuspect,
};
