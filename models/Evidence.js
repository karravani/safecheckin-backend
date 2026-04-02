// models/Evidence.js - UPDATED & COMPLETE
const mongoose = require("mongoose");

const evidenceSchema = new mongoose.Schema(
  {
    // ========== LINKING ========== //
    suspectId: {
      type: String, // ⚠️ CHANGED: String for custom suspect IDs like "SUSPECT_123_456"
      required: true,
      index: true,
    },
    alertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Alert",
      index: true,
    },
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guest",
      required: true, // ✅ Link to original guest
    },
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: true,
      index: true,
    },

    // ========== EVIDENCE DETAILS ========== //
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    evidenceType: {
      type: String,
      enum: ["Image", "Video", "Document", "Audio", "Other"],
      required: true,
    },
    category: {
      type: String,
      enum: ["CCTV", "Photo", "Document", "Report", "Statement", "Other"],
      required: true,
    },
    severity: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },

    // ========== FILES ========== //
    files: [
      {
        fileName: String,
        fileUrl: String,
        fileSize: Number,
        mimeType: String,
        duration: Number,
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: {
          userId: mongoose.Schema.Types.ObjectId,
          name: String,
          role: String,
        },
        description: String,
        tags: [String],
        isCompressed: { type: Boolean, default: false },
      },
    ],

    // ========== ACCESS CONTROL ========== //
    sharedWith: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        role: String,
        accessLevel: {
          type: String,
          enum: ["View", "Download", "Edit"],
          default: "View",
        },
        sharedAt: Date,
        sharedBy: {
          name: String,
          role: String,
        },
        canForward: { type: Boolean, default: false },
      },
    ],
    isPublic: {
      type: Boolean,
      default: false,
    },

    // ========== STATUS ========== //
    status: {
      type: String,
      enum: ["Pending Review", "Approved", "Rejected", "Archived"],
      default: "Pending Review",
      index: true,
    },
    approvedBy: {
      userId: mongoose.Schema.Types.ObjectId,
      name: String,
      timestamp: Date,
      notes: String,
    },
    rejectionReason: String,

    // ========== CHAIN OF CUSTODY ========== //
    chainOfCustody: [
      {
        action: String,
        performedBy: {
          userId: mongoose.Schema.Types.ObjectId,
          name: String,
          role: String,
          badgeNumber: String,
        },
        timestamp: { type: Date, default: Date.now },
        notes: String,
        ipAddress: String,
        deviceInfo: String,
      },
    ],

    // ========== METADATA ========== //
    location: {
      hotelName: String,
      roomNumber: String,
      floor: Number,
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },
    incidentDate: Date,
    expiryDate: Date,
    tags: [String],
    relatedCases: [String],
    sourceDevice: {
      deviceType: String,
      deviceId: String,
      deviceName: String,
    },

    // ========== VERIFICATION ========== //
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationDetails: {
      verifiedBy: String,
      verificationDate: Date,
      verificationMethod: String,
      authenticityScore: Number,
    },

    // ========== STATISTICS ========== //
    viewCount: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },

    // ========== SOFT DELETE ========== //
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true }
);

// ========== INDEXES ========== //
evidenceSchema.index({ suspectId: 1, createdAt: -1 });
evidenceSchema.index({ hotelId: 1, status: 1 });
evidenceSchema.index({ alertId: 1, createdAt: -1 });
evidenceSchema.index({ "sharedWith.userId": 1 });
evidenceSchema.index({ status: 1, isDeleted: 1 });
evidenceSchema.index({ category: 1, severity: 1 });

// ========== VIRTUAL FIELDS ========== //
evidenceSchema.virtual("age").get(function () {
  return Date.now() - this.createdAt;
});

evidenceSchema.virtual("isExpired").get(function () {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

evidenceSchema.virtual("totalFileSize").get(function () {
  return this.files.reduce((sum, file) => sum + (file.fileSize || 0), 0);
});

// ========== STATIC METHODS ========== //

// Get all evidence for a suspect
evidenceSchema.statics.getEvidenceBySuspect = function (suspectId) {
  return this.find({
    suspectId,
    isDeleted: false,
  })
    .populate("hotelId", "name")
    .sort({ createdAt: -1 });
};

// Get shared evidence for police
evidenceSchema.statics.getSharedEvidenceForPolice = function (policeId) {
  return this.find({
    "sharedWith.userId": policeId,
    isDeleted: false,
  })
    .populate("hotelId", "name")
    .sort({ createdAt: -1 });
};

// Get pending review evidence
evidenceSchema.statics.getPendingReview = function (hotelId) {
  return this.find({
    hotelId,
    status: "Pending Review",
    isDeleted: false,
  }).sort({ createdAt: -1 });
};

// Get evidence by category
evidenceSchema.statics.getByCategory = function (category, hotelId) {
  return this.find({
    category,
    hotelId,
    isDeleted: false,
  }).sort({ createdAt: -1 });
};

// Soft delete evidence
evidenceSchema.statics.softDelete = async function (evidenceId, userId) {
  return this.findByIdAndUpdate(
    evidenceId,
    {
      isDeleted: true,
      deletedAt: new Date(),
      $push: {
        chainOfCustody: {
          action: "Deleted",
          performedBy: {
            userId,
            name: "System",
            role: "Admin",
          },
          timestamp: new Date(),
        },
      },
    },
    { new: true }
  );
};

// Get statistics
evidenceSchema.statics.getStats = function (hotelId) {
  return this.aggregate([
    { $match: { hotelId, isDeleted: false } },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
        approved: {
          $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] },
        },
        pending: {
          $sum: { $cond: [{ $eq: ["$status", "Pending Review"] }, 1, 0] },
        },
      },
    },
  ]);
};

module.exports = mongoose.model("Evidence", evidenceSchema);
