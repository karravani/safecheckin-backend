// models/Police.js - ENHANCED VERSION
const mongoose = require("mongoose");

const policeSchema = new mongoose.Schema(
  {
    badgeNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    station: {
      type: String,
      required: true,
      index: true,
    },
    rank: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["admin_police", "sub_police"],
      default: "sub_police",
      required: true,
      index: true,
    },
    managedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Police",
      default: null,
    },
    permissions: {
      canManageHotels: { type: Boolean, default: true },
      canManageSuspects: { type: Boolean, default: true },
      canCreateAlerts: { type: Boolean, default: true },
      canViewReports: { type: Boolean, default: true },
      canDeleteRecords: { type: Boolean, default: false },
      canExportData: { type: Boolean, default: false },
      canManageUsers: { type: Boolean, default: false },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    // Add activity tracking
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    totalActivities: {
      type: Number,
      default: 0,
    },
    // Add profile fields
    contactNumber: String,
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String,
    },
    // Add department info
    department: {
      type: String,
      default: "General",
    },
    specialization: [String], // e.g., ["cybercrime", "narcotics"]
  },
  {
    timestamps: true,
  }
);

// Enhanced indexes
policeSchema.index({ role: 1, isActive: 1 });
policeSchema.index({ managedBy: 1 });
policeSchema.index({ station: 1, department: 1 });
policeSchema.index({ lastActivityAt: -1 });

// Virtual for activity stats
policeSchema.virtual("recentActivityCount").get(function () {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.lastActivityAt > oneDayAgo;
});

// Method to update activity
policeSchema.methods.updateActivity = function () {
  this.lastActivityAt = new Date();
  this.totalActivities += 1;
  return this.save();
};

module.exports = mongoose.model("Police", policeSchema);
