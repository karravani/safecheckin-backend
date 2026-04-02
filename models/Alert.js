// models/Alert.js - COMPLETE ENHANCED VERSION
const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: [true, "Hotel ID is required"],
      index: true,
    },
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guest",
      required: [true, "Guest ID is required"],
      index: true,
    },
    suspectVerification: {
      isVerifiedSuspect: {
        type: Boolean,
        default: false,
        index: true,
      },
      suspectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Suspect",
        default: null,
      },
      verifiedAt: {
        type: Date,
        default: null,
      },
      verifiedBy: {
        policeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Police",
        },
        name: String,
        rank: String,
      },
    },

    type: {
      type: String,
      required: [true, "Alert type is required"],
      enum: ["Police", "Security", "Management", "Emergency", "Maintenance"],
      index: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
      index: true,
    },
    title: {
      type: String,
      required: [true, "Alert title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Alert description is required"],
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    location: {
      roomNumber: {
        type: String,
        required: [true, "Room number is required"],
      },
      floor: String,
      building: String,
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },
    status: {
      type: String,
      enum: ["Pending", "Acknowledged", "In Progress", "Resolved", "Cancelled"],
      default: "Pending",
      index: true,
    },

    // ========== SUSPECT MANAGEMENT ========== //
    suspectDetails: {
      isSuspect: {
        type: Boolean,
        default: false,
        index: true,
      },
      suspectId: {
        type: String,
        index: true,
      },
      suspectDeleted: {
        type: Boolean,
        default: false,
        index: true,
      },
      suspectDeletedAt: {
        type: Date,
        default: null,
        index: true,
      },
      suspectDeletedBy: {
        name: String,
        role: String,
        badgeNumber: String,
        policeId: String,
      },
      deletionReason: {
        type: String,
        trim: true,
      },
      suspectBackup: {
        name: String,
        phone: String,
        aadhar: String,
        vehicle: String,
        email: String,
        address: String,
        age: Number,
        occupation: String,
      },
    },

    assignedTo: {
      name: String,
      role: String,
      contactNumber: String,
      assignedAt: Date,
    },
    createdBy: {
      name: String,
      role: {
        type: String,
        enum: ["Hotel Staff", "Guest", "System", "Manager"],
        default: "Hotel Staff",
      },
    },
    timeline: [
      {
        action: {
          type: String,
          required: true,
        },
        performedBy: {
          name: String,
          role: String,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        notes: String,
      },
    ],
    attachments: [
      {
        filename: String,
        fileType: String,
        fileSize: Number,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        data: String,
      },
    ],
    resolution: {
      summary: String,
      resolvedBy: {
        name: String,
        role: String,
      },
      resolvedAt: Date,
      actionsTaken: [String],
    },
    relatedAlerts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Alert",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// ========== INDEXES ========== //
alertSchema.index({ hotelId: 1, status: 1, createdAt: -1 });
alertSchema.index({ hotelId: 1, type: 1, priority: -1 });
alertSchema.index({ hotelId: 1, guestId: 1, createdAt: -1 });
alertSchema.index(
  {
    "suspectDetails.isSuspect": 1,
    "suspectDetails.suspectDeleted": 1,
    createdAt: -1,
  },
  {
    name: "suspect_management_index",
    background: true,
  }
);
alertSchema.index(
  {
    "suspectDetails.suspectId": 1,
    "suspectDetails.suspectDeleted": 1,
  },
  {
    name: "suspect_lookup_index",
    background: true,
  }
);
alertSchema.index(
  {
    "suspectDetails.isSuspect": 1,
    "suspectDetails.suspectDeletedAt": -1,
  },
  {
    name: "admin_suspect_tracking_index",
    background: true,
  }
);

// ========== VIRTUAL FIELDS ========== //
alertSchema.virtual("age").get(function () {
  return Date.now() - this.createdAt;
});

alertSchema.virtual("responseTime").get(function () {
  if (this.status === "Pending") return null;
  const acknowledgedEntry = this.timeline.find(
    (entry) => entry.action === "Acknowledged" || entry.action === "In Progress"
  );
  if (acknowledgedEntry) {
    return acknowledgedEntry.timestamp - this.createdAt;
  }
  return null;
});

alertSchema.virtual("suspectStatus").get(function () {
  if (!this.suspectDetails?.isSuspect) return "Not a suspect";
  if (this.suspectDetails?.suspectDeleted) return "Deleted suspect";
  return "Active suspect";
});

// ========== PRE-SAVE MIDDLEWARE ========== //
alertSchema.pre("save", function (next) {
  if (this.status === "Resolved" && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  this.isActive = !["Resolved", "Cancelled"].includes(this.status);
  next();
});

// ========== STATIC METHODS ========== //

// Check if guest has unresolved alerts
alertSchema.statics.hasUnresolvedAlerts = function (guestId, hotelId) {
  return this.findOne({
    guestId,
    hotelId,
    status: { $nin: ["Resolved", "Cancelled"] },
    isActive: true,
  });
};

// Get unresolved alerts count
alertSchema.statics.getUnresolvedAlertsCount = function (guestId, hotelId) {
  return this.countDocuments({
    guestId,
    hotelId,
    status: { $nin: ["Resolved", "Cancelled"] },
    isActive: true,
  });
};

// Get unresolved alerts
alertSchema.statics.getUnresolvedAlerts = function (guestId, hotelId) {
  return this.find({
    guestId,
    hotelId,
    status: { $nin: ["Resolved", "Cancelled"] },
    isActive: true,
  })
    .populate("guestId", "name roomNumber phone")
    .sort({ createdAt: -1 });
};

// Get active alerts
alertSchema.statics.getActiveAlerts = function (hotelId) {
  return this.find({
    hotelId,
    isActive: true,
  })
    .populate("guestId", "name roomNumber phone")
    .sort({ priority: -1, createdAt: -1 });
};

// Get alerts by priority
alertSchema.statics.getAlertsByPriority = function (hotelId, priority) {
  return this.find({
    hotelId,
    priority,
    isActive: true,
  })
    .populate("guestId", "name roomNumber phone")
    .sort({ createdAt: -1 });
};

// Get alert statistics
alertSchema.statics.getAlertStats = function (hotelId) {
  return this.aggregate([
    { $match: { hotelId: mongoose.Types.ObjectId(hotelId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);
};

// ⭐ NEW: Get active suspects (not deleted)
alertSchema.statics.getActiveSuspects = function () {
  return this.find({
    "suspectDetails.isSuspect": true,
    "suspectDetails.suspectDeleted": false,
  })
    .populate("guestId", "name phone email age occupation address")
    .sort({ createdAt: -1 });
};

// ⭐ NEW: Get all suspects (including deleted - admin only)
alertSchema.statics.getAllSuspectsForAdmin = function () {
  return this.find({
    "suspectDetails.isSuspect": true,
  })
    .populate("guestId", "name phone email age occupation address")
    .sort({ "suspectDetails.suspectDeletedAt": -1, createdAt: -1 });
};

// ⭐ NEW: Soft delete suspect
alertSchema.statics.softDeleteSuspect = async function (
  suspectId,
  deletedBy,
  reason
) {
  return this.updateMany(
    {
      "suspectDetails.suspectId": suspectId,
      "suspectDetails.isSuspect": true,
    },
    {
      $set: {
        "suspectDetails.suspectDeleted": true,
        "suspectDetails.suspectDeletedAt": new Date(),
        "suspectDetails.suspectDeletedBy": deletedBy,
        "suspectDetails.deletionReason": reason,
      },
    }
  );
};

// ⭐ NEW: Restore deleted suspect
alertSchema.statics.restoreSuspect = async function (suspectId) {
  return this.updateMany(
    {
      "suspectDetails.suspectId": suspectId,
      "suspectDetails.isSuspect": true,
      "suspectDetails.suspectDeleted": true,
    },
    {
      $set: {
        "suspectDetails.suspectDeleted": false,
        "suspectDetails.suspectDeletedAt": null,
        "suspectDetails.suspectDeletedBy": null,
        "suspectDetails.deletionReason": null,
      },
    }
  );
};

// ⭐ NEW: Get suspect by suspect ID
alertSchema.statics.getSuspectBySuspectId = function (suspectId) {
  return this.findOne({
    "suspectDetails.suspectId": suspectId,
    "suspectDetails.isSuspect": true,
  })
    .populate("guestId", "name phone email")
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model("Alert", alertSchema);
