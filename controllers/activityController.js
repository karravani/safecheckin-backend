// controllers/activityController.js - FIXED VERSION (No Recursive Errors)
const ActivityLog = require("../models/ActivityLog");
const Police = require("../models/Police");
const mongoose = require("mongoose");

// Track failed logging attempts to prevent recursion
let failedLoggingAttempts = 0;
const MAX_FAILED_ATTEMPTS = 5;
const FAILED_ATTEMPT_RESET_TIME = 60000; // 1 minute

// Reset failed attempts counter periodically
setInterval(() => {
  if (failedLoggingAttempts > 0) {
    console.log(
      `🔄 Resetting failed logging attempts: ${failedLoggingAttempts}`
    );
    failedLoggingAttempts = 0;
  }
}, FAILED_ATTEMPT_RESET_TIME);

// Action mapping for backward compatibility
const ACTION_MAPPING = {
  // Alert actions
  alert_viewed: "alert_viewed",
  alert_creation_blocked: "alert_creation_blocked",
  alert_acknowledged: "alert_acknowledged",
  alert_resolved: "alert_resolved",
  alert_status_updated: "alert_updated",
  alert_cancelled: "alert_cancelled",
  alert_assigned: "alert_assigned",

  // Suspect actions
  suspect_viewed: "suspect_viewed",
  suspect_verified: "suspect_verified",
  suspect_status_updated: "suspect_status_updated",
  suspect_notes_updated: "suspect_updated",
  suspect_restored: "suspect_updated",

  // Evidence actions
  evidence_uploaded: "evidence_uploaded",
  evidence_viewed: "evidence_viewed",
  evidence_shared: "evidence_shared",
  evidence_approved: "evidence_approved",
  evidence_rejected: "evidence_rejected",
  evidence_downloaded: "evidence_downloaded",

  // Report actions
  report_viewed: "report_viewed",
  report_generated: "report_generated",

  // Dashboard actions
  dashboard_viewed: "dashboard_viewed",
  statistics_viewed: "statistics_viewed",
};

// Helper function to determine severity based on action
const determineSeverity = (action, details = {}) => {
  const severityMap = {
    // Critical actions
    hotel_deleted: "critical",
    suspect_deleted: "critical",
    case_closed: "critical",
    system_backup: "critical",
    login_failed: "critical",

    // High importance
    hotel_registered: "high",
    hotel_verified: "high",
    suspect_added: "high",
    suspect_verified: "high",
    alert_created: "high",
    alert_creation_blocked: "high",
    case_created: "high",
    password_changed: "high",
    evidence_uploaded: "high",

    // Medium importance
    hotel_updated: "medium",
    suspect_updated: "medium",
    suspect_status_updated: "medium",
    alert_updated: "medium",
    alert_status_updated: "medium",
    alert_acknowledged: "medium",
    alert_resolved: "medium",
    report_generated: "medium",
    guest_flagged: "medium",

    // Low importance
    profile_updated: "low",
    login_attempt: "low",
    login_success: "low",
    logout: "low",
    report_viewed: "low",
    alert_viewed: "low",
    suspect_viewed: "low",
    dashboard_viewed: "low",
    guest_viewed: "low",
  };

  // Check if priority affects severity
  if (details.priority === "Critical") return "critical";
  if (details.priority === "High") return "high";

  return severityMap[action] || "medium";
};

// Helper function to determine category based on action
const determineCategory = (action) => {
  const categoryMap = {
    // Authentication
    login_attempt: "authentication",
    login_success: "authentication",
    login_failed: "authentication",
    logout: "authentication",
    password_changed: "authentication",

    // Security
    alert_created: "security",
    alert_updated: "security",
    alert_acknowledged: "security",
    alert_resolved: "security",
    alert_status_updated: "security",
    guest_flagged: "security",
    suspect_added: "security",
    suspect_verified: "security",
    suspect_status_updated: "security",
    alert_creation_blocked: "security",
    evidence_uploaded: "security",

    // Reporting
    report_generated: "reporting",
    report_viewed: "reporting",
    report_downloaded: "reporting",
    data_export: "reporting",

    // System
    system_backup: "system",
    system_maintenance: "system",
    logging_failed: "system",
    bulk_operation: "system",

    // Monitoring
    dashboard_viewed: "monitoring",
    statistics_viewed: "monitoring",
    alert_viewed: "monitoring",
    suspect_viewed: "monitoring",
  };

  return categoryMap[action] || "data_management";
};

// ⭐ MAIN FIX: Improved logActivity function with error prevention
const logActivity = async (
  performedBy,
  action,
  targetType,
  targetId,
  details = {},
  req = null
) => {
  try {
    // ✅ Prevent recursive logging failures
    if (failedLoggingAttempts >= MAX_FAILED_ATTEMPTS) {
      console.warn(
        "⚠️ Too many failed logging attempts - skipping activity log"
      );
      return null;
    }

    // ✅ Skip logging for system/failed logs to prevent recursion
    if (action === "logging_failed" || targetType === "system") {
      return null;
    }

    if (!performedBy || !action || !targetType || !targetId) {
      console.error("❌ Activity logging failed: Missing required parameters", {
        performedBy: !!performedBy,
        action: !!action,
        targetType: !!targetType,
        targetId: !!targetId,
      });
      failedLoggingAttempts++;
      return null;
    }

    // Convert performedBy to ObjectId if it's a valid string
    let performedByObjectId;
    try {
      if (mongoose.Types.ObjectId.isValid(performedBy)) {
        performedByObjectId = new mongoose.Types.ObjectId(performedBy);
      } else {
        console.warn("⚠️ Invalid performedBy ObjectId:", performedBy);
        failedLoggingAttempts++;
        return null;
      }
    } catch (error) {
      console.error("❌ Error converting performedBy to ObjectId:", error);
      failedLoggingAttempts++;
      return null;
    }

    const mappedAction = ACTION_MAPPING[action] || action;

    const activityData = {
      performedBy: performedByObjectId,
      action: mappedAction,
      targetType,
      targetId,
      details: {
        ...details,
        timestamp: new Date(),
        ...(action !== mappedAction && { originalAction: action }),
      },
      severity: determineSeverity(mappedAction, details),
      category: determineCategory(mappedAction),
      status: "success",
    };

    // Add request metadata if available
    if (req) {
      activityData.ipAddress =
        req.ip ||
        req.connection?.remoteAddress ||
        req.headers["x-forwarded-for"] ||
        req.socket?.remoteAddress;
      activityData.userAgent = req.get("User-Agent");
      activityData.sessionId = req.sessionID || req.headers["x-session-id"];
    }

    const activity = new ActivityLog(activityData);
    await activity.save();

    // ✅ Reset failed attempts on success
    if (failedLoggingAttempts > 0) {
      failedLoggingAttempts = 0;
    }

    console.log(`✅ Activity logged: ${mappedAction} by ${performedBy}`);
    return activity;
  } catch (error) {
    console.error("❌ Activity logging error:", error.message);
    failedLoggingAttempts++;

    // ⚠️ DON'T create a "logging_failed" log - this causes recursion!
    return null;
  }
};

// Get activity logs with pagination and filters (Admin only)
const getActivityLogs = async (req, res) => {
  try {
    // Only admin police can view all activity logs
    if (req.user?.policeRole !== "admin_police") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin police role required.",
        code: "ADMIN_ACCESS_REQUIRED",
      });
    }

    const {
      page = 1,
      limit = 20,
      officerId,
      action,
      targetType,
      startDate,
      endDate,
      status = null,
      severity = null,
      category = null,
    } = req.query;

    // Build filter object
    const filter = {};
    if (officerId) filter.performedBy = new mongoose.Types.ObjectId(officerId);
    if (action) filter.action = action;
    if (targetType) filter.targetType = targetType;
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (category) filter.category = category;

    // ✅ Exclude system/failed logs from UI
    filter.action = { $ne: "logging_failed" };

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [activities, totalCount] = await Promise.all([
      ActivityLog.find(filter)
        .populate("performedBy", "name badgeNumber rank station role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit: parseInt(limit),
        },
        filters: {
          officerId,
          action,
          targetType,
          startDate,
          endDate,
          status,
          severity,
          category,
        },
      },
    });
  } catch (error) {
    console.error("Get activity logs error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch activity logs",
      message: error.message,
    });
  }
};

// Enhanced getOfficerActivities with comprehensive statistics
const getOfficerActivities = async (req, res) => {
  try {
    if (req.user?.policeRole !== "admin_police") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin police role required.",
      });
    }

    const { officerId } = req.params;
    const {
      page = 1,
      limit = 50,
      days = 7,
      action,
      targetType,
      severity,
    } = req.query;

    // Verify officer exists
    const officer = await Police.findById(officerId);
    if (!officer) {
      return res.status(404).json({
        success: false,
        error: "Officer not found",
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Build filter for activities
    const filter = {
      performedBy: new mongoose.Types.ObjectId(officerId),
      createdAt: { $gte: startDate },
      action: { $ne: "logging_failed" }, // ✅ Exclude failed logs
    };

    if (action && action !== "all") filter.action = action;
    if (targetType && targetType !== "all") filter.targetType = targetType;
    if (severity && severity !== "all") filter.severity = severity;

    const skip = (page - 1) * limit;

    const [activities, totalCount, recentCount, activityStats] =
      await Promise.all([
        ActivityLog.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),

        // Total count for this officer (all time, excluding failed logs)
        ActivityLog.countDocuments({
          performedBy: new mongoose.Types.ObjectId(officerId),
          action: { $ne: "logging_failed" },
        }),

        // Count for the filtered period
        ActivityLog.countDocuments(filter),

        // Detailed statistics using aggregation
        ActivityLog.aggregate([
          {
            $match: {
              performedBy: new mongoose.Types.ObjectId(officerId),
              createdAt: { $gte: startDate },
              action: { $ne: "logging_failed" },
            },
          },
          {
            $group: {
              _id: null,
              totalActivities: { $sum: 1 },
              categoryBreakdown: { $push: "$category" },
              severityBreakdown: { $push: "$severity" },
              actionBreakdown: { $push: "$action" },
            },
          },
          {
            $addFields: {
              authenticationCount: {
                $size: {
                  $filter: {
                    input: "$categoryBreakdown",
                    cond: { $eq: ["$$this", "authentication"] },
                  },
                },
              },
              securityCount: {
                $size: {
                  $filter: {
                    input: "$categoryBreakdown",
                    cond: { $eq: ["$$this", "security"] },
                  },
                },
              },
              lowSeverityCount: {
                $size: {
                  $filter: {
                    input: "$severityBreakdown",
                    cond: { $eq: ["$$this", "low"] },
                  },
                },
              },
              mediumSeverityCount: {
                $size: {
                  $filter: {
                    input: "$severityBreakdown",
                    cond: { $eq: ["$$this", "medium"] },
                  },
                },
              },
              highSeverityCount: {
                $size: {
                  $filter: {
                    input: "$severityBreakdown",
                    cond: { $eq: ["$$this", "high"] },
                  },
                },
              },
              criticalSeverityCount: {
                $size: {
                  $filter: {
                    input: "$severityBreakdown",
                    cond: { $eq: ["$$this", "critical"] },
                  },
                },
              },
              alertActivitiesCount: {
                $size: {
                  $filter: {
                    input: "$actionBreakdown",
                    cond: { $regexMatch: { input: "$$this", regex: "alert" } },
                  },
                },
              },
            },
          },
        ]),
      ]);

    const stats =
      activityStats.length > 0
        ? activityStats[0]
        : {
            totalActivities: 0,
            authenticationCount: 0,
            securityCount: 0,
            lowSeverityCount: 0,
            mediumSeverityCount: 0,
            highSeverityCount: 0,
            criticalSeverityCount: 0,
            alertActivitiesCount: 0,
          };

    res.json({
      success: true,
      data: {
        officer: {
          id: officer._id,
          name: officer.name,
          badgeNumber: officer.badgeNumber,
          rank: officer.rank,
        },
        activities,
        totalCount,
        recentCount,
        statistics: {
          ...stats,
          averageActivitiesPerDay:
            Math.round((recentCount / parseInt(days)) * 10) / 10,
          activityTrend:
            recentCount > totalCount * 0.1 ? "increasing" : "stable",
        },
        dateRange: {
          from: startDate,
          to: new Date(),
          days: parseInt(days),
        },
      },
    });
  } catch (error) {
    console.error("Get officer activities error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch officer activities",
      message: error.message,
    });
  }
};

// Get activity statistics (Admin only)
const getActivityStats = async (req, res) => {
  try {
    if (req.user?.policeRole !== "admin_police") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin police role required.",
      });
    }

    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const baseFilter = {
      createdAt: { $gte: startDate },
      action: { $ne: "logging_failed" }, // ✅ Exclude failed logs
    };

    const [
      totalActivities,
      activitiesByAction,
      activitiesByOfficer,
      activitiesByCategory,
      activitiesBySeverity,
      recentActivities,
      dailyActivities,
    ] = await Promise.all([
      ActivityLog.countDocuments(baseFilter),

      ActivityLog.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      ActivityLog.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$performedBy", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "polices",
            localField: "_id",
            foreignField: "_id",
            as: "officer",
          },
        },
        { $unwind: "$officer" },
        {
          $project: {
            count: 1,
            officer: {
              name: "$officer.name",
              badgeNumber: "$officer.badgeNumber",
            },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      ActivityLog.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      ActivityLog.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      ActivityLog.find(baseFilter)
        .populate("performedBy", "name badgeNumber")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      ActivityLog.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalActivities,
          dateRange: { from: startDate, to: new Date(), days: parseInt(days) },
        },
        activitiesByAction,
        activitiesByOfficer,
        activitiesByCategory,
        activitiesBySeverity,
        recentActivities,
        dailyActivities,
      },
    });
  } catch (error) {
    console.error("Get activity stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch activity statistics",
      message: error.message,
    });
  }
};

// Get my activities (for sub-police to see their own activities)
const getMyActivities = async (req, res) => {
  try {
    const { page = 1, limit = 20, days = 7, category, severity } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const filter = {
      performedBy: new mongoose.Types.ObjectId(req.user.policeId),
      createdAt: { $gte: startDate },
      action: { $ne: "logging_failed" }, // ✅ Exclude failed logs
    };

    if (category) filter.category = category;
    if (severity) filter.severity = severity;

    const skip = (page - 1) * limit;

    const [activities, totalCount, myStats] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ActivityLog.countDocuments({
        performedBy: new mongoose.Types.ObjectId(req.user.policeId),
        action: { $ne: "logging_failed" },
      }),
      ActivityLog.aggregate([
        {
          $match: {
            performedBy: new mongoose.Types.ObjectId(req.user.policeId),
            createdAt: { $gte: startDate },
            action: { $ne: "logging_failed" },
          },
        },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        activities,
        totalCount,
        recentCount: activities.length,
        myStats,
        dateRange: {
          from: startDate,
          to: new Date(),
          days: parseInt(days),
        },
      },
    });
  } catch (error) {
    console.error("Get my activities error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch your activities",
      message: error.message,
    });
  }
};

module.exports = {
  logActivity,
  getActivityLogs,
  getOfficerActivities,
  getActivityStats,
  getMyActivities,
  determineSeverity,
  determineCategory,
};
