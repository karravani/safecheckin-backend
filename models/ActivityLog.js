// models/ActivityLog.js - COMPLETE WITH ALL NEW FEATURES
const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Police",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        // ========== AUTHENTICATION ACTIONS ========== //
        "login_attempt",
        "login_success",
        "login_failed",
        "logout",
        "password_changed",
        "role_updated",
        "token_refreshed",

        // ========== HOTEL ACTIONS ========== //
        "hotel_verified",
        "hotel_registered",
        "hotel_updated",
        "hotel_deleted",
        "hotel_viewed",
        "hotel_suspended",
        "hotel_activated",

        // ========== SUSPECT ACTIONS (NEW) ========== //
        "suspect_added", // When guest marked as suspect
        "suspect_verified", // ⭐ When police verifies suspect
        "suspect_updated", // General suspect updates
        "suspect_status_updated", // ⭐ When suspect status changes
        "suspect_deleted", // When suspect soft-deleted
        "suspect_restored", // ⭐ When admin restores deleted suspect
        "suspect_viewed", // When police views suspect details
        "suspect_searched", // When police searches for suspects
        "suspect_notes_updated", // ⭐ When police updates suspect notes

        // ========== ALERT ACTIONS (ENHANCED) ========== //
        "alert_created", // When hotel creates alert
        "alert_updated", // General alert updates
        "alert_viewed", // When police views alert
        "alert_removed", // When alert deleted
        "alert_resolved", // ⭐ When alert marked as resolved
        "alert_acknowledged", // ⭐ When police acknowledges alert
        "alert_cancelled", // ⭐ When alert cancelled
        "alert_assigned", // ⭐ When alert assigned to officer
        "alert_creation_blocked", // ⭐ When duplicate alert prevented
        "alert_status_updated", // ⭐ When alert status changes (In Progress, etc.)

        // ========== EVIDENCE ACTIONS (NEW) ========== //
        "evidence_uploaded", // ⭐ When hotel uploads evidence
        "evidence_viewed", // ⭐ When police views evidence
        "evidence_shared", // ⭐ When evidence shared with specific police
        "evidence_approved", // ⭐ When police approves evidence
        "evidence_rejected", // ⭐ When police rejects evidence
        "evidence_deleted", // ⭐ When evidence deleted
        "evidence_downloaded", // ⭐ When evidence file downloaded
        "evidence_updated", // ⭐ When evidence metadata updated

        // ========== CASE ACTIONS (NEW) ========== //
        "case_created", // ⭐ When new case created
        "case_handled", // ⭐ When police handles case
        "case_updated", // ⭐ When case details updated
        "case_closed", // ⭐ When case closed
        "case_reopened", // ⭐ When case reopened
        "case_assigned", // ⭐ When case assigned to officer
        "case_viewed", // ⭐ When police views case

        // ========== REPORT ACTIONS ========== //
        "report_generated",
        "report_viewed",
        "report_downloaded",
        "report_exported",
        "report_shared",

        // ========== GUEST ACTIONS ========== //
        "guest_checked", // Check-in/check-out
        "guest_flagged", // When guest flagged as suspicious
        "guest_viewed",
        "guest_searched",
        "guest_updated",
        "guest_unflagged", // ⭐ When guest flag removed

        // ========== PROFILE ACTIONS ========== //
        "profile_updated",
        "profile_viewed",
        "officer_status_changed", // ⭐ When admin changes officer status

        // ========== SYSTEM ACTIONS ========== //
        "bulk_operation",
        "data_export",
        "data_import",
        "system_backup",
        "system_maintenance",
        "system_event",
        "logging_failed", // Keep but filter from UI
        "status_changed",

        // ========== DASHBOARD ACTIONS ========== //
        "dashboard_viewed",
        "statistics_viewed",
        "analytics_viewed",

        // ========== GENERIC ACTIONS ========== //
        "created",
        "updated",
        "deleted",
        "viewed",
        "searched",
        "exported",
        "imported",
      ],
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: [
        "hotel",
        "suspect",
        "alert",
        "case",
        "report",
        "guest",
        "profile",
        "system",
        "user",
        "dashboard",
        "auth",
        "activity",
        "evidence", // ⭐ NEW
        "officer", // ⭐ NEW
        "analytics", // ⭐ NEW
      ],
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      previousData: mongoose.Schema.Types.Mixed,
      newData: mongoose.Schema.Types.Mixed,
      affectedFields: [String],
      recordCount: Number, // For bulk operations
      duration: Number, // For timed operations
      originalAction: String, // For mapped actions
      performedBy: String, // ⭐ Name of person performing action
      suspectId: String, // ⭐ Related suspect ID
      alertId: String, // ⭐ Related alert ID
      evidenceId: String, // ⭐ Related evidence ID
      guestId: String, // ⭐ Related guest ID
      hotelId: String, // ⭐ Related hotel ID
    },
    ipAddress: {
      type: String,
      default: null,
      index: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
      country: String,
      city: String,
    },
    sessionId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      enum: ["success", "failed", "pending", "cancelled"],
      default: "success",
      index: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
      index: true,
    },
    category: {
      type: String,
      enum: [
        "authentication",
        "data_management",
        "security",
        "reporting",
        "system",
        "monitoring",
        "case_management", // ⭐ NEW
        "evidence_management", // ⭐ NEW
      ],
      default: "data_management",
      index: true,
    },
    errorMessage: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// ========== ENHANCED INDEXES ========== //
activityLogSchema.index({ performedBy: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ targetType: 1, targetId: 1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ status: 1, severity: 1 });
activityLogSchema.index({ category: 1, action: 1 });
activityLogSchema.index({ ipAddress: 1, createdAt: -1 });

// ⭐ NEW: Additional indexes for better performance
activityLogSchema.index({ "metadata.suspectId": 1, createdAt: -1 });
activityLogSchema.index({ "metadata.alertId": 1, createdAt: -1 });
activityLogSchema.index({ "metadata.evidenceId": 1, createdAt: -1 });
activityLogSchema.index({ "metadata.hotelId": 1, createdAt: -1 });

// TTL index to automatically delete old logs (90 days)
activityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

// Text index for searching
activityLogSchema.index({
  action: "text",
  "details.description": "text",
  "details.notes": "text",
  "metadata.performedBy": "text",
});

// ========== STATIC METHODS ========== //

// Get recent activities for a specific officer
activityLogSchema.statics.getRecentActivities = function (
  performedBy,
  limit = 10
) {
  return this.find({
    performedBy,
    action: { $ne: "logging_failed" }, // Exclude system errors
  })
    .populate("performedBy", "name badgeNumber rank station")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get activities by type (alert, suspect, evidence, etc.)
activityLogSchema.statics.getActivitiesByType = function (
  targetType,
  days = 7
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.find({
    targetType,
    createdAt: { $gte: startDate },
    action: { $ne: "logging_failed" },
  })
    .populate("performedBy", "name badgeNumber rank")
    .sort({ createdAt: -1 });
};

// Get all activities for a specific user
activityLogSchema.statics.getUserActivity = function (userId, limit = 50) {
  return this.find({
    performedBy: userId,
    action: { $ne: "logging_failed" },
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get security events (high/critical severity)
activityLogSchema.statics.getSecurityEvents = function (limit = 50) {
  return this.find({
    $or: [
      { action: "login_failed" },
      { severity: "high" },
      { severity: "critical" },
      { status: "failed" },
    ],
    action: { $ne: "logging_failed" },
  })
    .populate("performedBy", "name badgeNumber rank station")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ⭐ NEW: Get activities by suspect
activityLogSchema.statics.getActivitiesBySuspect = function (
  suspectId,
  limit = 50
) {
  return this.find({
    $or: [{ targetId: suspectId }, { "metadata.suspectId": suspectId }],
    action: { $ne: "logging_failed" },
  })
    .populate("performedBy", "name badgeNumber rank")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ⭐ NEW: Get activities by alert
activityLogSchema.statics.getActivitiesByAlert = function (
  alertId,
  limit = 50
) {
  return this.find({
    $or: [{ targetId: alertId }, { "metadata.alertId": alertId }],
    action: { $ne: "logging_failed" },
  })
    .populate("performedBy", "name badgeNumber rank")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ⭐ NEW: Get evidence activities
activityLogSchema.statics.getEvidenceActivities = function (
  evidenceId,
  limit = 50
) {
  return this.find({
    $or: [
      { targetId: evidenceId },
      { "metadata.evidenceId": evidenceId },
      { targetType: "evidence" },
    ],
    action: { $ne: "logging_failed" },
  })
    .populate("performedBy", "name badgeNumber rank")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ⭐ NEW: Get case activities
activityLogSchema.statics.getCaseActivities = function (caseId, limit = 50) {
  return this.find({
    targetId: caseId,
    targetType: "case",
    action: { $ne: "logging_failed" },
  })
    .populate("performedBy", "name badgeNumber rank")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ⭐ NEW: Get activities by category (for dashboard analytics)
activityLogSchema.statics.getActivitiesByCategory = function (
  category,
  days = 30
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        category: category,
        createdAt: { $gte: startDate },
        action: { $ne: "logging_failed" },
      },
    },
    {
      $group: {
        _id: "$action",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

// ⭐ NEW: Get daily activity statistics
activityLogSchema.statics.getDailyStats = function (days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        action: { $ne: "logging_failed" },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          category: "$category",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": 1 } },
  ]);
};

// ⭐ NEW: Get officer performance metrics
activityLogSchema.statics.getOfficerMetrics = function (officerId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        performedBy: mongoose.Types.ObjectId(officerId),
        createdAt: { $gte: startDate },
        action: { $ne: "logging_failed" },
      },
    },
    {
      $group: {
        _id: null,
        totalActivities: { $sum: 1 },
        // Count by category
        securityActivities: {
          $sum: { $cond: [{ $eq: ["$category", "security"] }, 1, 0] },
        },
        caseActivities: {
          $sum: { $cond: [{ $eq: ["$category", "case_management"] }, 1, 0] },
        },
        evidenceActivities: {
          $sum: {
            $cond: [{ $eq: ["$category", "evidence_management"] }, 1, 0],
          },
        },
        // Count by severity
        criticalActions: {
          $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] },
        },
        highActions: {
          $sum: { $cond: [{ $eq: ["$severity", "high"] }, 1, 0] },
        },
        // Latest activity
        latestActivity: { $max: "$createdAt" },
      },
    },
  ]);
};

// Virtual for activity age in human-readable format
activityLogSchema.virtual("age").get(function () {
  return Date.now() - this.createdAt;
});

// Virtual for human-readable action
activityLogSchema.virtual("actionReadable").get(function () {
  return this.action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
});

// Pre-save hook to ensure data consistency
activityLogSchema.pre("save", function (next) {
  // Ensure metadata exists
  if (!this.metadata) {
    this.metadata = {};
  }

  // Auto-populate metadata from details if available
  if (this.details) {
    if (this.details.suspectId)
      this.metadata.suspectId = this.details.suspectId;
    if (this.details.alertId) this.metadata.alertId = this.details.alertId;
    if (this.details.evidenceId)
      this.metadata.evidenceId = this.details.evidenceId;
    if (this.details.hotelId) this.metadata.hotelId = this.details.hotelId;
    if (this.details.performedBy)
      this.metadata.performedBy = this.details.performedBy;
  }

  next();
});

// Method to check if activity is significant (for notifications)
activityLogSchema.methods.isSignificant = function () {
  const significantActions = [
    "suspect_verified",
    "alert_created",
    "alert_resolved",
    "evidence_approved",
    "evidence_rejected",
    "case_closed",
    "login_failed",
  ];

  return (
    significantActions.includes(this.action) ||
    this.severity === "critical" ||
    this.severity === "high"
  );
};

module.exports = mongoose.model("ActivityLog", activityLogSchema);
