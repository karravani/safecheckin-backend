// routes/activityRoutes.js - COMPLETE WITH SUSPECT TIMELINE
const express = require("express");
const router = express.Router();
const ActivityLog = require("../models/ActivityLog");
const {
  getActivityLogs,
  getOfficerActivities,
  getActivityStats,
  getMyActivities,
} = require("../controllers/activityController");
const { authenticatePolice } = require("../middleware/policeAuth");

// Middleware helpers
const requireAdminPolice = (req, res, next) => {
  if (req.user?.policeRole !== "admin_police") {
    return res.status(403).json({
      success: false,
      error: "Access denied. Admin police role required.",
    });
  }
  next();
};

const requireAnyPolice = (req, res, next) => {
  if (!req.user?.policeId && !req.user?.id) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
    });
  }
  next();
};

// Debug middleware
router.use((req, res, next) => {
  console.log(`📊 Activity Route: ${req.method} ${req.originalUrl}`);
  next();
});

// Apply authentication to all routes
router.use(authenticatePolice);

// ========== ADMIN-ONLY ROUTES ========== //
// Get all activity logs with filters and pagination
router.get("/logs", requireAdminPolice, getActivityLogs);

// Get activities for a specific officer (with comprehensive stats)
router.get("/officer/:officerId", requireAdminPolice, getOfficerActivities);

// Get overall activity statistics
router.get("/stats", requireAdminPolice, getActivityStats);

// ========== ANY POLICE OFFICER ROUTES ========== //
// Get own activities
router.get("/my-activities", requireAnyPolice, getMyActivities);

// ========== SUSPECT/GUEST ACTIVITY ROUTES ========== //

// Get all activities for a specific suspect/guest
router.get("/suspect/:suspectId", requireAnyPolice, async (req, res) => {
  try {
    const { suspectId } = req.params;
    const { page = 1, limit = 50, days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log(`📊 Fetching activities for suspect: ${suspectId}`);

    // Find activities related to this suspect
    const [activities, totalCount] = await Promise.all([
      ActivityLog.find({
        $or: [
          { targetId: suspectId },
          { "details.suspectId": suspectId },
          { "details.guestId": suspectId },
          { "metadata.suspectId": suspectId },
          { "metadata.guestId": suspectId },
        ],
        createdAt: { $gte: startDate },
        action: { $ne: "logging_failed" },
      })
        .populate("performedBy", "name badgeNumber rank station")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      ActivityLog.countDocuments({
        $or: [
          { targetId: suspectId },
          { "details.suspectId": suspectId },
          { "details.guestId": suspectId },
          { "metadata.suspectId": suspectId },
          { "metadata.guestId": suspectId },
        ],
        action: { $ne: "logging_failed" },
      }),
    ]);

    console.log(`✅ Found ${activities.length} activities for suspect`);

    // Group activities by action type
    const actionBreakdown = activities.reduce((acc, activity) => {
      const action = activity.action;
      acc[action] = (acc[action] || 0) + 1;
      return acc;
    }, {});

    // Get timeline events
    const timelineEvents = activities
      .filter(
        (a) =>
          a.action.includes("alert") ||
          a.action.includes("evidence") ||
          a.action.includes("suspect")
      )
      .map((a) => ({
        _id: a._id,
        action: a.action,
        actionReadable: a.action
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        performedBy: a.performedBy,
        timestamp: a.createdAt,
        details: a.details,
        severity: a.severity,
        category: a.category,
      }));

    res.json({
      success: true,
      data: {
        suspectId,
        activities,
        timeline: timelineEvents,
        statistics: {
          totalCount,
          recentCount: activities.length,
          actionBreakdown,
          dateRange: {
            from: startDate,
            to: new Date(),
            days: parseInt(days),
          },
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
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
});

// Get activity timeline for suspect (formatted for UI display)
router.get(
  "/suspect/:suspectId/timeline",
  requireAnyPolice,
  async (req, res) => {
    try {
      const { suspectId } = req.params;
      const { limit = 20 } = req.query;

      console.log(`📅 Fetching timeline for suspect: ${suspectId}`);

      // Get recent activities formatted for timeline display
      const activities = await ActivityLog.find({
        $or: [
          { targetId: suspectId },
          { "details.suspectId": suspectId },
          { "details.guestId": suspectId },
        ],
        action: { $ne: "logging_failed" },
      })
        .populate("performedBy", "name badgeNumber rank")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean();

      console.log(`✅ Found ${activities.length} timeline events`);

      // Format for timeline display
      const timeline = activities.map((activity) => {
        let description = "";
        let icon = "info";
        let color = "blue";

        // Format description based on action
        switch (activity.action) {
          case "alert_created":
            description = `Alert created: ${
              activity.details?.title || "New alert"
            }`;
            icon = "alert";
            color = "orange";
            break;
          case "alert_status_updated":
            description = `Status changed from ${
              activity.details?.previousStatus || "Unknown"
            } to ${activity.details?.newStatus || "Unknown"}`;
            icon = "update";
            color = "blue";
            break;
          case "alert_acknowledged":
            description = `Alert acknowledged by ${
              activity.details?.acknowledgedBy ||
              activity.performedBy?.name ||
              "Officer"
            }`;
            icon = "check";
            color = "green";
            break;
          case "alert_resolved":
            description = `Alert resolved by ${
              activity.details?.resolvedBy ||
              activity.performedBy?.name ||
              "Officer"
            }`;
            icon = "success";
            color = "green";
            break;
          case "alert_cancelled":
            description = `Alert cancelled: ${
              activity.details?.reason || "No reason provided"
            }`;
            icon = "cancel";
            color = "red";
            break;
          case "alert_assigned":
            description = `Alert assigned to ${
              activity.details?.assignedTo || "Officer"
            }`;
            icon = "assign";
            color = "purple";
            break;
          case "evidence_uploaded":
            description = `Evidence uploaded: ${
              activity.details?.title || "New evidence"
            }`;
            icon = "file";
            color = "purple";
            break;
          case "evidence_approved":
            description = `Evidence approved by ${
              activity.details?.approvedBy ||
              activity.performedBy?.name ||
              "Officer"
            }`;
            icon = "approve";
            color = "green";
            break;
          case "evidence_rejected":
            description = `Evidence rejected by ${
              activity.details?.rejectedBy ||
              activity.performedBy?.name ||
              "Officer"
            }`;
            icon = "reject";
            color = "red";
            break;
          case "suspect_verified":
            description = `Suspect verified by ${
              activity.performedBy?.name || "Officer"
            }`;
            icon = "verify";
            color = "blue";
            break;
          case "suspect_status_updated":
            description = `Suspect status updated to ${
              activity.details?.newStatus || "Unknown"
            }`;
            icon = "update";
            color = "blue";
            break;
          default:
            description = activity.action
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");
            icon = "info";
            color = "gray";
        }

        return {
          _id: activity._id,
          action: activity.action,
          description,
          icon,
          color,
          performedBy: activity.performedBy?.name || "Unknown",
          performedByBadge: activity.performedBy?.badgeNumber,
          performedByRank: activity.performedBy?.rank,
          timestamp: activity.createdAt,
          details: activity.details,
          severity: activity.severity,
        };
      });

      res.json({
        success: true,
        data: {
          suspectId,
          timeline,
          count: timeline.length,
        },
      });
    } catch (error) {
      console.error("Get suspect timeline error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch suspect timeline",
        message: error.message,
      });
    }
  }
);

// Health check
router.get("/health", requireAnyPolice, (req, res) => {
  res.json({
    success: true,
    message: "Activity monitoring system is operational",
    user: {
      policeId: req.user.policeId,
      name: req.user.name,
      role: req.user.policeRole,
    },
    timestamp: new Date().toISOString(),
    features: {
      activityLogging: true,
      realTimeMonitoring: true,
      comprehensiveStats: true,
      officerTracking: true,
      suspectTimeline: true,
    },
  });
});

module.exports = router;
