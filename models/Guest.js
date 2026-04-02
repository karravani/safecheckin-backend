const mongoose = require("mongoose");

// INSTANT file storage schema - stores paths instead of GridFS IDs
const photoSchema = {
  path: { type: String }, // Relative path to file on disk
  filename: { type: String }, // Generated filename on disk
  originalName: { type: String }, // Original uploaded filename
  size: { type: Number }, // File size in bytes
  uploadTime: { type: Date, default: Date.now },
  mimeType: { type: String }, // MIME type for proper serving
  isCompressed: { type: Boolean, default: false }, // Background compression status
};

const guestSchema = new mongoose.Schema(
  {
    // Basic guest information
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^[\+]?[\d]{10,15}$/.test(v);
        },
        message: "Please provide a valid phone number (10-15 digits)",
      },
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: "Please provide a valid email address",
      },
    },
    nationality: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    purpose: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "personal",
        "business",
        "tourism",
        "medical",
        "education",
        "other",
      ],
    },

    // Guest count and breakdown
    guestCount: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
    },
    maleGuests: {
      type: Number,
      default: 0,
      min: 0,
      max: 20,
    },
    femaleGuests: {
      type: Number,
      default: 0,
      min: 0,
      max: 20,
    },
    childGuests: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },

    // Time tracking
    checkInTime: {
      type: Date,
      default: Date.now,
      index: true,
    },
    checkOutDate: {
      type: Date,
      default: null,
    },

    // Booking information
    bookingMode: {
      type: String,
      enum: ["Direct", "Online", "Travel Agent"],
      required: true,
      default: "Direct",
    },
    bookingWebsite: {
      type: String,
      required: function () {
        return this.bookingMode === "Online";
      },
      trim: true,
      maxlength: 100,
    },
    referenceNumber: {
      type: String,
      trim: true,
      maxlength: 50,
      index: true, // For quick booking reference lookup
    },

    // Room and status
    roomNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10,
      index: true,
    },
    status: {
      type: String,
      enum: ["checked-in", "checked-out", "reported", "flagged"],
      default: "checked-in",
      index: true,
    },

    // Individual guest details
    guests: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
          maxlength: 100,
        },
        idType: {
          type: String,
          required: true,
          enum: [
            "Passport",
            "National ID",
            "Driver License",
            "Voter ID",
            "Aadhar Card",
            "Other",
          ],
        },
        idNumber: {
          type: String,
          required: true,
          trim: true,
          maxlength: 50,
        },
        isPrimary: {
          type: Boolean,
          default: false,
        },
        email: {
          type: String,
          trim: true,
          lowercase: true,
          validate: {
            validator: function (v) {
              return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: "Please provide a valid email address for guest",
          },
        },
        age: {
          type: Number,
          min: 0,
          max: 120,
        },
        gender: {
          type: String,
          enum: ["Male", "Female", "Other"],
        },
        relationship: {
          type: String,
          trim: true,
          maxlength: 50, // e.g., "Spouse", "Child", "Friend", etc.
        },
      },
    ],

    // Hotel association
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: true,
      index: true,
    },

    // Financial information
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    advanceAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    balanceAmount: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Card", "UPI", "Bank Transfer", "Online", "Other"],
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Partial", "Paid", "Refunded"],
      default: "Pending",
    },

    // INSTANT PHOTO STORAGE - File paths for lightning-fast access
    photos: {
      guestPhoto: photoSchema,
      idFront: photoSchema,
      idBack: photoSchema,
    },

    // Security and flagging
    isFlagged: {
      type: Boolean,
      default: false,
      index: true,
    },
    flagReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    flaggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Police",
      default: null,
    },
    flaggedAt: {
      type: Date,
      default: null,
    },
    securityLevel: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Low",
    },

    // Notes and additional information
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    specialRequests: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    // Audit trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Alert tracking
    alertsSent: [
      {
        type: {
          type: String,
          enum: ["Police", "Security", "Management", "Emergency"],
        },
        sentAt: {
          type: Date,
          default: Date.now,
        },
        reason: {
          type: String,
          required: true,
          trim: true,
          maxlength: 200,
        },
        status: {
          type: String,
          enum: ["Sent", "Acknowledged", "Resolved", "Escalated"],
          default: "Sent",
        },
        sentBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        acknowledgedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Police",
        },
        acknowledgedAt: Date,
        response: {
          type: String,
          trim: true,
          maxlength: 500,
        },
      },
    ],

    // Verification status
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    verifiedAt: Date,

    // Check-in device information (for audit)
    checkInDevice: {
      ipAddress: String,
      userAgent: String,
      location: {
        latitude: Number,
        longitude: Number,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// PERFORMANCE OPTIMIZED INDEXES
guestSchema.index({ hotelId: 1, roomNumber: 1 });
guestSchema.index({ hotelId: 1, status: 1 });
guestSchema.index({ hotelId: 1, checkInTime: -1 });
guestSchema.index({ phone: 1, hotelId: 1 });
guestSchema.index({ "guests.idNumber": 1, hotelId: 1 });
guestSchema.index({ referenceNumber: 1 }); // For booking lookups
guestSchema.index({ isFlagged: 1, hotelId: 1 }); // For security queries
guestSchema.index({ createdBy: 1, checkInTime: -1 }); // For user activity
guestSchema.index({ flaggedBy: 1, flaggedAt: -1 }); // For police dashboard

// VALIDATION MIDDLEWARE - Enhanced
guestSchema.pre("save", function (next) {
  // Ensure guest count matches individual counts
  const totalIndividual =
    this.maleGuests + this.femaleGuests + this.childGuests;
  if (totalIndividual > 0 && totalIndividual !== this.guestCount) {
    return next(
      new Error(
        `Guest count mismatch: total (${this.guestCount}) should equal sum of male (${this.maleGuests}), female (${this.femaleGuests}), and child (${this.childGuests}) guests`
      )
    );
  }

  // Ensure at least one primary guest exists
  const primaryGuests = this.guests.filter((guest) => guest.isPrimary);
  if (this.guests.length > 0) {
    if (primaryGuests.length === 0) {
      this.guests[0].isPrimary = true;
    } else if (primaryGuests.length > 1) {
      return next(new Error("Only one primary guest is allowed"));
    }
  }

  // Auto-calculate balance amount
  this.balanceAmount = this.totalAmount - this.advanceAmount;

  // Set payment status based on amounts
  if (this.totalAmount <= 0) {
    this.paymentStatus = "Pending";
  } else if (this.advanceAmount >= this.totalAmount) {
    this.paymentStatus = "Paid";
  } else if (this.advanceAmount > 0) {
    this.paymentStatus = "Partial";
  }

  next();
});

// INSTANCE METHODS - Enhanced for hotel operations
guestSchema.methods.checkOut = function (checkOutDate = new Date()) {
  this.status = "checked-out";
  this.checkOutDate = checkOutDate;
  return this.save();
};

guestSchema.methods.updateBalance = function () {
  this.balanceAmount = this.totalAmount - this.advanceAmount;
  return this;
};

guestSchema.methods.flagGuest = function (reason, flaggedBy) {
  this.isFlagged = true;
  this.flagReason = reason;
  this.flaggedBy = flaggedBy;
  this.flaggedAt = new Date();
  this.status = "flagged";
  return this.save();
};

guestSchema.methods.sendAlert = function (alertType, reason, sentBy) {
  this.alertsSent.push({
    type: alertType,
    reason: reason,
    sentBy: sentBy,
    sentAt: new Date(),
  });
  return this.save();
};

guestSchema.methods.verifyGuest = function (verifiedBy) {
  this.isVerified = true;
  this.verifiedBy = verifiedBy;
  this.verifiedAt = new Date();
  return this.save();
};

// Get primary guest information
guestSchema.methods.getPrimaryGuest = function () {
  return this.guests.find((guest) => guest.isPrimary) || this.guests[0] || null;
};

// Get photo URL for frontend
guestSchema.methods.getPhotoUrl = function (photoType) {
  if (this.photos && this.photos[photoType] && this.photos[photoType].path) {
    return `/api/guests/photo/${this.hotelId}/${photoType}/${this.photos[photoType].filename}`;
  }
  return null;
};

// STATIC METHODS - Enhanced for hotel management
guestSchema.statics.findByHotel = function (hotelId, status = null) {
  const query = { hotelId };
  if (status) query.status = status;
  return this.find(query)
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email")
    .sort({ checkInTime: -1 });
};

guestSchema.statics.findByRoom = function (
  hotelId,
  roomNumber,
  status = "checked-in"
) {
  return this.find({ hotelId, roomNumber, status });
};

guestSchema.statics.checkUniqueness = function (hotelId, phone, idNumber) {
  const query = {
    hotelId,
    status: { $ne: "checked-out" },
  };

  if (phone && idNumber) {
    query.$or = [{ phone }, { "guests.idNumber": idNumber }];
  } else if (phone) {
    query.phone = phone;
  } else if (idNumber) {
    query["guests.idNumber"] = idNumber;
  }

  return this.findOne(query);
};

// Get hotel statistics
guestSchema.statics.getHotelStats = function (hotelId) {
  return this.aggregate([
    { $match: { hotelId: hotelId } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalGuests: { $sum: "$guestCount" },
      },
    },
  ]);
};

// Get flagged guests for security dashboard
guestSchema.statics.getFlaggedGuests = function (hotelId = null) {
  const query = { isFlagged: true };
  if (hotelId) query.hotelId = hotelId;

  return this.find(query)
    .populate("hotelId", "name address")
    .populate("flaggedBy", "name badgeNumber")
    .sort({ flaggedAt: -1 });
};

// Search guests with advanced filtering
guestSchema.statics.searchGuests = function (hotelId, searchOptions = {}) {
  const query = { hotelId };

  if (searchOptions.status) query.status = searchOptions.status;
  if (searchOptions.roomNumber)
    query.roomNumber = new RegExp(searchOptions.roomNumber, "i");
  if (searchOptions.isFlagged !== undefined)
    query.isFlagged = searchOptions.isFlagged;

  if (searchOptions.searchTerm) {
    query.$or = [
      { name: new RegExp(searchOptions.searchTerm, "i") },
      { phone: new RegExp(searchOptions.searchTerm, "i") },
      { email: new RegExp(searchOptions.searchTerm, "i") },
      { roomNumber: new RegExp(searchOptions.searchTerm, "i") },
      { "guests.name": new RegExp(searchOptions.searchTerm, "i") },
      { "guests.idNumber": new RegExp(searchOptions.searchTerm, "i") },
    ];
  }

  if (searchOptions.dateRange) {
    if (searchOptions.dateRange.from) {
      query.checkInTime = { $gte: new Date(searchOptions.dateRange.from) };
    }
    if (searchOptions.dateRange.to) {
      query.checkInTime = {
        ...query.checkInTime,
        $lte: new Date(searchOptions.dateRange.to),
      };
    }
  }

  return this.find(query)
    .populate("createdBy", "name email")
    .populate("flaggedBy", "name badgeNumber")
    .sort({ checkInTime: -1 });
};

module.exports = mongoose.model("Guest", guestSchema);
