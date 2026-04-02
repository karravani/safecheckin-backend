// models/Suspect.js - NEW MODEL for verified suspects
const mongoose = require("mongoose");

const suspectSchema = new mongoose.Schema(
  {
    // Core References
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guest",
      required: true,
      index: true,
    },
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: true,
      index: true,
    },
    alertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Alert",
      required: true,
      index: true,
    },

    // Suspect Data Snapshot (captured at time of verification)
    // This is a snapshot - not live data, so updates to Guest won't affect this
    suspectData: {
      name: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      email: String,
      aadhar: String, // Consider encryption in production
      address: String,
      age: Number,
      nationality: String,
      roomNumber: String,
      // Photo URLs at time of flagging
      photos: {
        guestPhoto: String,
        idFront: String,
        idBack: String,
      },
      // Additional guest details
      checkInTime: Date,
      purpose: String,
      bookingMode: String,
    },

    // Verification Details - Who verified this suspect
    verifiedBy: {
      policeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Police",
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      rank: {
        type: String,
        required: true,
      },
      badgeNumber: {
        type: String,
        required: true,
      },
      station: String,
      verifiedAt: {
        type: Date,
        default: Date.now,
      },
    },

    // Evidence and Reason for Suspicion
    evidence: {
      reasonForSuspicion: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
      },
      additionalNotes: {
        type: String,
        trim: true,
        maxlength: 2000,
      },
      // File attachments (for future implementation)
      attachments: [
        {
          filename: String,
          originalName: String,
          fileType: String,
          fileSize: Number,
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
          uploadedBy: {
            policeId: mongoose.Schema.Types.ObjectId,
            name: String,
          },
          url: String, // Path to file
        },
      ],
    },

    // Suspect Status Management
    status: {
      type: String,
      enum: ["Active", "Cleared", "Under Investigation", "Arrested"],
      default: "Active",
      index: true,
    },

    // Update History - Track all changes (NO DELETE, only updates)
    updateHistory: [
      {
        updatedBy: {
          policeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Police",
          },
          name: String,
          rank: String,
          badgeNumber: String,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
        fieldUpdated: String, // Which field was updated
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        reason: String, // Reason for update
        notes: String,
      },
    ],

    // Associated Alerts (one suspect can be linked to multiple alerts)
    associatedAlerts: [
      {
        alertId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Alert",
        },
        alertTitle: String,
        alertType: String,
        alertPriority: String,
        alertDate: Date,
        alertStatus: String,
      },
    ],

    // Case Management (if suspect is part of a case)
    relatedCases: [
      {
        caseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Case",
        },
        caseNumber: String,
        caseTitle: String,
        addedAt: Date,
      },
    ],

    // Metadata
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Hotel notification status
    hotelNotified: {
      type: Boolean,
      default: false,
    },
    hotelNotifiedAt: Date,

    // Last updated information
    lastUpdatedBy: {
      policeId: mongoose.Schema.Types.ObjectId,
      name: String,
      rank: String,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

// ========== INDEXES for Performance ========== //
suspectSchema.index({ guestId: 1, hotelId: 1 });
suspectSchema.index({ status: 1, isActive: 1 });
suspectSchema.index({ "verifiedBy.policeId": 1 });
suspectSchema.index({ createdAt: -1 });
suspectSchema.index({ "suspectData.phone": 1 });
suspectSchema.index({ "suspectData.aadhar": 1 });

// Compound index for police dashboard queries
suspectSchema.index({ status: 1, createdAt: -1, isActive: 1 });

// Compound index for hotel-specific suspect queries
suspectSchema.index({ hotelId: 1, status: 1, isActive: 1 });

// ========== VIRTUAL FIELDS ========== //

// Get time since verification
suspectSchema.virtual("daysSinceVerification").get(function () {
  const now = new Date();
  const verified = this.verifiedBy.verifiedAt;
  const diffTime = Math.abs(now - verified);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Get total number of updates
suspectSchema.virtual("totalUpdates").get(function () {
  return this.updateHistory.length;
});

// ========== INSTANCE METHODS ========== //

// Update suspect status
suspectSchema.methods.updateStatus = function (
  newStatus,
  updatedBy,
  reason,
  notes
) {
  const oldStatus = this.status;

  // Add to update history
  this.updateHistory.push({
    updatedBy: {
      policeId: updatedBy.policeId,
      name: updatedBy.name,
      rank: updatedBy.rank,
      badgeNumber: updatedBy.badgeNumber,
    },
    fieldUpdated: "status",
    oldValue: oldStatus,
    newValue: newStatus,
    reason: reason,
    notes: notes,
  });

  // Update the status
  this.status = newStatus;

  // Update last updated by
  this.lastUpdatedBy = {
    policeId: updatedBy.policeId,
    name: updatedBy.name,
    rank: updatedBy.rank,
  };

  return this.save();
};

// Add additional notes
suspectSchema.methods.addNotes = function (newNotes, updatedBy, reason) {
  const oldNotes = this.evidence.additionalNotes;

  this.updateHistory.push({
    updatedBy: {
      policeId: updatedBy.policeId,
      name: updatedBy.name,
      rank: updatedBy.rank,
      badgeNumber: updatedBy.badgeNumber,
    },
    fieldUpdated: "evidence.additionalNotes",
    oldValue: oldNotes,
    newValue: newNotes,
    reason: reason,
  });

  this.evidence.additionalNotes = newNotes;
  this.lastUpdatedBy = {
    policeId: updatedBy.policeId,
    name: updatedBy.name,
    rank: updatedBy.rank,
  };

  return this.save();
};

// Add associated alert
suspectSchema.methods.addAssociatedAlert = function (alert) {
  const exists = this.associatedAlerts.find(
    (a) => a.alertId.toString() === alert._id.toString()
  );

  if (!exists) {
    this.associatedAlerts.push({
      alertId: alert._id,
      alertTitle: alert.title,
      alertType: alert.type,
      alertPriority: alert.priority,
      alertDate: alert.createdAt,
      alertStatus: alert.status,
    });
    return this.save();
  }

  return Promise.resolve(this);
};

// Add to case
suspectSchema.methods.addToCase = function (caseData) {
  const exists = this.relatedCases.find(
    (c) => c.caseId.toString() === caseData._id.toString()
  );

  if (!exists) {
    this.relatedCases.push({
      caseId: caseData._id,
      caseNumber: caseData.caseNumber,
      caseTitle: caseData.title,
      addedAt: new Date(),
    });
    return this.save();
  }

  return Promise.resolve(this);
};

// ========== STATIC METHODS ========== //

// Get all active suspects
suspectSchema.statics.getActiveSuspects = function (filter = {}) {
  return this.find({ isActive: true, status: "Active", ...filter })
    .populate("guestId", "name phone email roomNumber status")
    .populate("hotelId", "name address")
    .populate("verifiedBy.policeId", "name rank badgeNumber station")
    .sort({ createdAt: -1 });
};

// Get suspects by hotel
suspectSchema.statics.getSuspectsByHotel = function (
  hotelId,
  includeInactive = false
) {
  const query = { hotelId };
  if (!includeInactive) {
    query.isActive = true;
  }

  return this.find(query)
    .populate("guestId", "name phone email roomNumber status")
    .populate("verifiedBy.policeId", "name rank badgeNumber station")
    .sort({ createdAt: -1 });
};

// Get suspects by status
suspectSchema.statics.getSuspectsByStatus = function (status, hotelId = null) {
  const query = { status, isActive: true };
  if (hotelId) {
    query.hotelId = hotelId;
  }

  return this.find(query)
    .populate("guestId", "name phone email")
    .populate("hotelId", "name address")
    .populate("verifiedBy.policeId", "name rank badgeNumber")
    .sort({ createdAt: -1 });
};

// Search suspects
suspectSchema.statics.searchSuspects = function (searchTerm, hotelId = null) {
  const query = { isActive: true };
  if (hotelId) {
    query.hotelId = hotelId;
  }

  if (searchTerm) {
    query.$or = [
      { "suspectData.name": new RegExp(searchTerm, "i") },
      { "suspectData.phone": new RegExp(searchTerm, "i") },
      { "suspectData.aadhar": new RegExp(searchTerm, "i") },
      { "suspectData.roomNumber": new RegExp(searchTerm, "i") },
    ];
  }

  return this.find(query)
    .populate("guestId", "name phone status")
    .populate("hotelId", "name")
    .populate("verifiedBy.policeId", "name rank")
    .sort({ createdAt: -1 });
};

// Get suspect statistics
suspectSchema.statics.getSuspectStats = async function (hotelId = null) {
  const matchQuery = { isActive: true };
  if (hotelId) {
    matchQuery.hotelId = hotelId;
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const totalSuspects = await this.countDocuments(matchQuery);

  return {
    total: totalSuspects,
    byStatus: stats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
  };
};

// Check if guest is already a suspect
suspectSchema.statics.isGuestSuspect = function (guestId) {
  return this.findOne({
    guestId,
    isActive: true,
    status: { $in: ["Active", "Under Investigation"] },
  });
};

module.exports = mongoose.model("Suspect", suspectSchema);
