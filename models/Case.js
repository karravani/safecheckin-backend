// models/Case.js - NEW MODEL
const mongoose = require("mongoose");

const caseSchema = new mongoose.Schema(
  {
    caseNumber: {
      type: String,
      unique: true,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["Criminal", "Civil", "Investigation", "Complaint", "Other"],
      required: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["Open", "In Progress", "Under Review", "Closed", "Suspended"],
      default: "Open",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Police",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Police",
      required: true,
    },
    involvedParties: [
      {
        type: {
          type: String,
          enum: ["Complainant", "Accused", "Witness", "Victim"],
        },
        name: String,
        contact: String,
        address: String,
        details: mongoose.Schema.Types.Mixed,
      },
    ],
    relatedHotels: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hotel",
      },
    ],
    relatedGuests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Guest",
      },
    ],
    relatedAlerts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Alert",
      },
    ],
    evidence: [
      {
        type: String, // File name or description
        description: String,
        uploadedAt: Date,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Police",
        },
      },
    ],
    timeline: [
      {
        action: String,
        description: String,
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Police",
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    resolution: {
      summary: String,
      outcome: String,
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Police",
      },
      resolvedAt: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
caseSchema.index({ caseNumber: 1 });
caseSchema.index({ assignedTo: 1, status: 1 });
caseSchema.index({ createdBy: 1 });
caseSchema.index({ type: 1, priority: 1 });
caseSchema.index({ status: 1, createdAt: -1 });

// Auto-generate case number
caseSchema.pre("save", async function (next) {
  if (this.isNew) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1),
      },
    });
    this.caseNumber = `CASE-${year}-${(count + 1).toString().padStart(4, "0")}`;
  }
  next();
});

module.exports = mongoose.model("Case", caseSchema);
