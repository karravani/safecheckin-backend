// models/Hotel.js - UPDATED VERSION (Removed duplicate phone and room rate)
const mongoose = require("mongoose");

const hotelSchema = new mongoose.Schema(
  {
    // Basic hotel information
    name: {
      type: String,
      required: true,
      index: true,
    },
    accommodationType: {
      type: String,
      enum: ["Hotel", "Lodge", "Guest House", "Resort", "Homestay"],
      default: "Hotel",
      required: true,
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

    // Owner information (keeping only owner's phone)
    ownerName: {
      type: String,
      required: true,
    },
    ownerPhone: {
      type: String,
      required: true,
    },
    ownerAadharNumber: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          return /^\d{12}$/.test(v);
        },
        message: "Aadhar number must be 12 digits",
      },
    },

    // Property details (removed roomRate)
    numberOfRooms: {
      type: Number,
      required: true,
      min: 1,
    },

    // Address information
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, default: "India" },
      fullAddress: String,
    },

    // System generated location (coordinates)
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },

    // Legal documentation
    gstNumber: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
            v
          );
        },
        message: "Invalid GST number format",
      },
    },
    labourLicenceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    hotelLicenceNumber: {
      type: String,
      required: true,
      unique: true,
    },

    // Police registration fields
    registeredByPolice: {
      type: Boolean,
      default: false,
    },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Police",
      default: null,
    },
    policeOfficer: {
      id: String,
      name: String,
      badgeNumber: String,
      station: String,
      rank: String,
    },

    // Verification fields
    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ["verified", "pending", "unverified"],
      default: "pending",
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Police",
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verificationNotes: {
      type: String,
      default: null,
    },
    verificationHistory: [
      {
        status: {
          type: String,
          enum: ["verified", "pending", "unverified"],
          required: true,
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Police",
          required: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        notes: String,
        officerInfo: {
          name: String,
          badgeNumber: String,
          station: String,
          rank: String,
        },
      },
    ],

    // Status fields
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    registrationDate: {
      type: Date,
      default: Date.now,
    },
    lastLogin: {
      type: Date,
      default: null,
    },

    // Settings
    settings: {
      allowOnlineBooking: { type: Boolean, default: true },
      requireIdVerification: { type: Boolean, default: true },
      autoSendAlerts: { type: Boolean, default: true },
      notificationPreferences: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
      },
    },

    category: {
      type: String,
      enum: ["Budget", "Standard", "Premium", "Luxury"],
      default: "Standard",
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Enhanced indexes
hotelSchema.index({ isVerified: 1, isActive: 1 });
hotelSchema.index({ verificationStatus: 1 });
hotelSchema.index({ registeredBy: 1 });
hotelSchema.index({ verifiedBy: 1 });
hotelSchema.index({ "address.city": 1 });
hotelSchema.index({ "address.state": 1 });
hotelSchema.index({ category: 1 });
hotelSchema.index({ location: "2dsphere" });
hotelSchema.index({ gstNumber: 1 });
hotelSchema.index({ ownerAadharNumber: 1 });

// Virtual fields
hotelSchema.virtual("totalGuests").get(function () {
  return 0; // Implement actual calculation
});

hotelSchema.virtual("activeGuests").get(function () {
  return 0; // Implement actual calculation
});
// Pre-save middleware to sync isVerified with verificationStatus
hotelSchema.pre("save", function (next) {
  if (this.verificationStatus === "verified") {
    this.isVerified = true;
    if (!this.verifiedAt) {
      this.verifiedAt = new Date();
    }
  } else {
    this.isVerified = false;
  }
  next();
});

module.exports = mongoose.model("Hotel", hotelSchema);
