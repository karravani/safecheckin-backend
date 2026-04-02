// controllers/hotelAuthController.js - UPDATED to match new schema
const Hotel = require("../models/Hotel");
const { logActivity } = require("./activityController");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// Generate JWT token
const generateToken = (hotelId) => {
  return jwt.sign({ hotelId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// Register new hotel - UPDATED to match new schema
const registerHotel = async (req, res) => {
  try {
    const {
      name,
      accommodationType,
      email,
      password,
      ownerName,
      ownerPhone,
      ownerAadharNumber,
      numberOfRooms,
      address,
      gstNumber,
      labourLicenceNumber,
      hotelLicenceNumber,
      registeredByPolice,
      policeOfficerId,
      policeOfficerInfo,
      verificationStatus,
      verificationNotes,
    } = req.body;

    console.log("📝 Registration request received:", {
      name,
      accommodationType,
      email: email ? email.substring(0, 10) + "..." : "missing",
      ownerName,
      ownerPhone,
      numberOfRooms,
      address,
      gstNumber,
      labourLicenceNumber,
      hotelLicenceNumber,
      verificationStatus,
    });

    // Validate required fields
    if (
      !name ||
      !accommodationType ||
      !email ||
      !password ||
      !ownerName ||
      !ownerPhone ||
      !ownerAadharNumber ||
      !numberOfRooms ||
      !address?.street ||
      !address?.city ||
      !address?.state ||
      !address?.zipCode ||
      !gstNumber ||
      !labourLicenceNumber ||
      !hotelLicenceNumber
    ) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        error: "All required fields must be provided",
        required: [
          "name",
          "accommodationType",
          "email",
          "password",
          "ownerName",
          "ownerPhone",
          "ownerAadharNumber",
          "numberOfRooms",
          "address.street",
          "address.city",
          "address.state",
          "address.zipCode",
          "gstNumber",
          "labourLicenceNumber",
          "hotelLicenceNumber",
        ],
      });
    }

    // Check for duplicate email
    const existingHotelEmail = await Hotel.findOne({
      email: email.toLowerCase(),
    });
    if (existingHotelEmail) {
      return res.status(400).json({
        error: "Hotel with this email already exists",
        code: "EMAIL_EXISTS",
      });
    }

    // Check for duplicate GST number
    const existingGST = await Hotel.findOne({
      gstNumber: gstNumber.toUpperCase(),
    });
    if (existingGST) {
      return res.status(400).json({
        error: "Hotel with this GST number already exists",
        code: "GST_EXISTS",
      });
    }

    // Check for duplicate Aadhar number
    const existingAadhar = await Hotel.findOne({ ownerAadharNumber });
    if (existingAadhar) {
      return res.status(400).json({
        error: "Owner with this Aadhar number already exists",
        code: "AADHAR_EXISTS",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Enhanced police officer data handling
    let policeOfficerData = null;
    let actualPoliceOfficerId = null;

    // Check if request comes from authenticated police officer
    if (req.user && req.user.policeId) {
      actualPoliceOfficerId = req.user.policeId;
      policeOfficerData = {
        id: req.user.policeId,
        name: req.user.name || "Police Officer",
        badgeNumber: req.user.badgeNumber || "N/A",
        station: req.user.station || "N/A",
        rank: req.user.rank || "Officer",
      };
    } else if (policeOfficerInfo && policeOfficerId) {
      actualPoliceOfficerId = policeOfficerId;
      policeOfficerData = {
        id: policeOfficerId,
        name: policeOfficerInfo.name || "Police Officer",
        badgeNumber: policeOfficerInfo.badgeNumber || "N/A",
        station: policeOfficerInfo.station || "N/A",
        rank: policeOfficerInfo.rank || "Officer",
      };
    } else if (policeOfficerId) {
      try {
        const Police = require("../models/Police");
        const policeOfficer = await Police.findById(policeOfficerId).select(
          "-password"
        );
        if (policeOfficer) {
          actualPoliceOfficerId = policeOfficerId;
          policeOfficerData = {
            id: policeOfficer._id.toString(),
            name: policeOfficer.name,
            badgeNumber: policeOfficer.badgeNumber,
            station: policeOfficer.station,
            rank: policeOfficer.rank,
          };
        }
      } catch (fetchError) {
        console.error("Error fetching police officer details:", fetchError);
      }
    }

    // Create full address string
    const fullAddress = `${address.street}, ${address.city}, ${address.state} ${
      address.zipCode
    }, ${address.country || "India"}`;

    // Set verification status (default to pending if not provided)
    const finalVerificationStatus = verificationStatus || "pending";
    const isVerified = finalVerificationStatus === "verified";

    const hotel = new Hotel({
      name: name.trim(),
      accommodationType: accommodationType || "Hotel",
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      ownerName: ownerName.trim(),
      ownerPhone: ownerPhone.trim(),
      ownerAadharNumber: ownerAadharNumber.trim(),
      numberOfRooms: parseInt(numberOfRooms),
      address: {
        street: address.street.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        zipCode: address.zipCode.trim(),
        country: address.country || "India",
        fullAddress: fullAddress,
      },
      gstNumber: gstNumber.toUpperCase().trim(),
      labourLicenceNumber: labourLicenceNumber.trim(),
      hotelLicenceNumber: hotelLicenceNumber.trim(),
      registeredByPolice: registeredByPolice || false,
      registeredBy: actualPoliceOfficerId
        ? new mongoose.Types.ObjectId(actualPoliceOfficerId)
        : null,
      policeOfficer: policeOfficerData,
      // NEW: Verification status fields
      verificationStatus: finalVerificationStatus,
      isVerified: isVerified,
      verifiedAt: isVerified ? new Date() : null,
      verifiedBy:
        isVerified && actualPoliceOfficerId
          ? new mongoose.Types.ObjectId(actualPoliceOfficerId)
          : null,
      verificationNotes: verificationNotes || null,
      verificationHistory: [
        {
          status: finalVerificationStatus,
          changedBy: actualPoliceOfficerId
            ? new mongoose.Types.ObjectId(actualPoliceOfficerId)
            : null,
          changedAt: new Date(),
          notes:
            verificationNotes ||
            `Initial registration with ${finalVerificationStatus} status`,
          officerInfo: policeOfficerData,
        },
      ],
    });

    await hotel.save();
    console.log("✅ Hotel saved successfully:", hotel.name);

    // Log activity if registered by police
    if (actualPoliceOfficerId) {
      try {
        await logActivity(
          actualPoliceOfficerId,
          "hotel_registered",
          "hotel",
          hotel._id,
          {
            hotelName: hotel.name,
            accommodationType: hotel.accommodationType,
            ownerName: hotel.ownerName,
            location: hotel.address,
            numberOfRooms: hotel.numberOfRooms,
            gstNumber: hotel.gstNumber,
            verificationStatus: finalVerificationStatus,
            registeredBy: policeOfficerData?.name || "Police Officer",
            registrationMethod: "police_portal",
          },
          req
        );
        console.log(
          `✅ Activity logged: hotel_registered by ${policeOfficerData?.name}`
        );
      } catch (logError) {
        console.error("❌ Failed to log activity:", logError);
      }
    }

    const token = generateToken(hotel._id);

    res.status(201).json({
      message: "Hotel registered successfully",
      token,
      hotel: {
        id: hotel._id,
        name: hotel.name,
        accommodationType: hotel.accommodationType,
        email: hotel.email,
        ownerName: hotel.ownerName,
        ownerPhone: hotel.ownerPhone,
        numberOfRooms: hotel.numberOfRooms,
        address: hotel.address,
        gstNumber: hotel.gstNumber,
        labourLicenceNumber: hotel.labourLicenceNumber,
        hotelLicenceNumber: hotel.hotelLicenceNumber,
        registrationDate: hotel.registrationDate,
        registeredByPolice: hotel.registeredByPolice,
        registeredBy: hotel.registeredBy,
        policeOfficer: hotel.policeOfficer,
        verificationStatus: hotel.verificationStatus,
        isVerified: hotel.isVerified,
        verifiedAt: hotel.verifiedAt,
        verificationNotes: hotel.verificationNotes,
      },
    });
  } catch (error) {
    console.error("Hotel registration error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: "Validation failed",
        details: messages,
      });
    }

    if (error.code === 11000) {
      // Handle duplicate key error
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        error: `${field} already exists`,
        code: "DUPLICATE_KEY",
      });
    }

    res.status(500).json({
      error: "Registration failed",
      message: "An error occurred during registration",
    });
  }
};
// NEW: Update verification status function
const updateVerificationStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.policeId) {
      return res.status(403).json({
        error: "Only police officers can update verification status",
      });
    }

    const { hotelId } = req.params;
    const { verificationStatus, verificationNotes } = req.body;

    if (
      !verificationStatus ||
      !["verified", "pending", "unverified"].includes(verificationStatus)
    ) {
      return res.status(400).json({
        error:
          "Valid verification status is required (verified, pending, unverified)",
      });
    }

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        error: "Hotel not found",
      });
    }

    const previousStatus = hotel.verificationStatus;
    const previousIsVerified = hotel.isVerified;

    // Update verification status
    hotel.verificationStatus = verificationStatus;
    hotel.isVerified = verificationStatus === "verified";
    hotel.verificationNotes = verificationNotes || hotel.verificationNotes;

    if (verificationStatus === "verified") {
      hotel.verifiedAt = new Date();
      hotel.verifiedBy = req.user.policeId;
    } else if (verificationStatus === "unverified") {
      hotel.verifiedAt = null;
      hotel.verifiedBy = null;
    }

    // Add to verification history
    hotel.verificationHistory.push({
      status: verificationStatus,
      changedBy: req.user.policeId,
      changedAt: new Date(),
      notes:
        verificationNotes ||
        `Status changed from ${previousStatus} to ${verificationStatus}`,
      officerInfo: {
        name: req.user.name,
        badgeNumber: req.user.badgeNumber,
        station: req.user.station,
        rank: req.user.rank,
      },
    });

    await hotel.save();

    // Log activity
    try {
      await logActivity(
        req.user.policeId,
        "hotel_verification_updated",
        "hotel",
        hotel._id,
        {
          hotelName: hotel.name,
          ownerName: hotel.ownerName,
          updatedBy: req.user.name,
          previousStatus: previousStatus,
          newStatus: verificationStatus,
          verificationNotes: verificationNotes,
          previousIsVerified: previousIsVerified,
          newIsVerified: hotel.isVerified,
        },
        req
      );
      console.log(
        `✅ Hotel verification status updated: ${hotel.name} changed to ${verificationStatus} by ${req.user.name}`
      );
    } catch (logError) {
      console.error("❌ Failed to log verification update activity:", logError);
    }

    res.json({
      message: `Hotel verification status updated to ${verificationStatus}`,
      hotel: {
        id: hotel._id,
        name: hotel.name,
        verificationStatus: hotel.verificationStatus,
        isVerified: hotel.isVerified,
        verifiedAt: hotel.verifiedAt,
        verificationNotes: hotel.verificationNotes,
      },
    });
  } catch (error) {
    console.error("Update verification status error:", error);
    res.status(500).json({
      error: "Failed to update verification status",
    });
  }
};
// Update hotel profile - UPDATED with new field names
const updateHotelProfile = async (req, res) => {
  try {
    const {
      name,
      accommodationType,
      ownerName,
      ownerPhone,
      numberOfRooms,
      address,
      settings,
    } = req.body;

    const currentHotel = await Hotel.findById(req.hotelId);
    if (!currentHotel) {
      return res.status(404).json({ error: "Hotel not found" });
    }

    const updateData = {};
    const updatedFields = [];

    if (name && name !== currentHotel.name) {
      updateData.name = name.trim();
      updatedFields.push("name");
    }
    if (
      accommodationType &&
      accommodationType !== currentHotel.accommodationType
    ) {
      updateData.accommodationType = accommodationType;
      updatedFields.push("accommodationType");
    }
    if (ownerName && ownerName !== currentHotel.ownerName) {
      updateData.ownerName = ownerName.trim();
      updatedFields.push("ownerName");
    }
    if (ownerPhone && ownerPhone !== currentHotel.ownerPhone) {
      updateData.ownerPhone = ownerPhone.trim();
      updatedFields.push("ownerPhone");
    }
    if (numberOfRooms && numberOfRooms !== currentHotel.numberOfRooms) {
      updateData.numberOfRooms = parseInt(numberOfRooms);
      updatedFields.push("numberOfRooms");
    }
    if (address) {
      updateData.address = { ...currentHotel.address, ...address };
      updatedFields.push("address");
    }
    if (settings) {
      updateData.settings = { ...currentHotel.settings, ...settings };
      updatedFields.push("settings");
    }

    const hotel = await Hotel.findByIdAndUpdate(req.hotelId, updateData, {
      new: true,
      runValidators: true,
    });

    // Log activity if there were actual updates
    if (updatedFields.length > 0) {
      await logActivity(
        req.user?.policeId || "hotel_staff",
        "hotel_updated",
        "hotel",
        hotel._id,
        {
          hotelName: hotel.name,
          updatedFields,
          previousData: {
            name: currentHotel.name,
            accommodationType: currentHotel.accommodationType,
            ownerName: currentHotel.ownerName,
            ownerPhone: currentHotel.ownerPhone,
            numberOfRooms: currentHotel.numberOfRooms,
          },
          newData: updateData,
        },
        req
      );
    }

    res.json({
      message: "Profile updated successfully",
      hotel: {
        id: hotel._id,
        name: hotel.name,
        accommodationType: hotel.accommodationType,
        email: hotel.email,
        ownerName: hotel.ownerName,
        ownerPhone: hotel.ownerPhone,
        numberOfRooms: hotel.numberOfRooms,
        address: hotel.address,
        settings: hotel.settings,
        verificationStatus: hotel.verificationStatus,
        isVerified: hotel.isVerified,
      },
    });
  } catch (error) {
    console.error("Update hotel profile error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: "Validation failed",
        details: messages,
      });
    }

    res.status(500).json({
      error: "Failed to update profile",
    });
  }
};

// Keep all other existing functions unchanged...
const loginHotel = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const hotel = await Hotel.findOne({
      email: email.toLowerCase().trim(),
      isActive: true,
    });

    if (!hotel) {
      return res.status(401).json({
        error: "Invalid credentials",
        code: "INVALID_CREDENTIALS",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, hotel.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Invalid credentials",
        code: "INVALID_CREDENTIALS",
      });
    }

    hotel.lastLogin = new Date();
    await hotel.save();

    const token = generateToken(hotel._id);

    res.json({
      message: "Login successful",
      token,
      hotel: {
        id: hotel._id,
        name: hotel.name,
        accommodationType: hotel.accommodationType,
        email: hotel.email,
        ownerName: hotel.ownerName,
        ownerPhone: hotel.ownerPhone,
        numberOfRooms: hotel.numberOfRooms,
        address: hotel.address,
        lastLogin: hotel.lastLogin,
        settings: hotel.settings,
        verificationStatus: hotel.verificationStatus,
        isVerified: hotel.isVerified,
        verifiedAt: hotel.verifiedAt,
      },
    });
  } catch (error) {
    console.error("Hotel login error:", error);
    res.status(500).json({
      error: "Login failed",
      message: "An error occurred during login",
    });
  }
};

// Rest of functions remain the same...
const getHotelProfile = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.hotelId)
      .populate("verifiedBy", "name badgeNumber station rank")
      .populate("registeredBy", "name badgeNumber station rank");

    if (!hotel) {
      return res.status(404).json({
        error: "Hotel not found",
      });
    }

    res.json({
      hotel: {
        id: hotel._id,
        name: hotel.name,
        accommodationType: hotel.accommodationType,
        email: hotel.email,
        ownerName: hotel.ownerName,
        ownerPhone: hotel.ownerPhone,
        numberOfRooms: hotel.numberOfRooms,
        address: hotel.address,
        gstNumber: hotel.gstNumber,
        registrationDate: hotel.registrationDate,
        lastLogin: hotel.lastLogin,
        settings: hotel.settings,
        verificationStatus: hotel.verificationStatus,
        isVerified: hotel.isVerified,
        verifiedAt: hotel.verifiedAt,
        verificationNotes: hotel.verificationNotes,
        verifiedBy: hotel.verifiedBy,
        registeredBy: hotel.registeredBy,
        policeOfficer: hotel.policeOfficer,
        verificationHistory: hotel.verificationHistory,
      },
    });
  } catch (error) {
    console.error("Get hotel profile error:", error);
    res.status(500).json({
      error: "Failed to fetch hotel profile",
    });
  }
};
// Keep all other functions as they were...
const verifyHotel = async (req, res) => {
  try {
    if (!req.user || !req.user.policeId) {
      return res.status(403).json({
        error: "Only police officers can verify hotels",
      });
    }

    const { hotelId } = req.params;
    const { verificationNotes } = req.body;

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        error: "Hotel not found",
      });
    }

    if (hotel.verificationStatus === "verified") {
      return res.status(400).json({
        error: "Hotel is already verified",
      });
    }

    const previousStatus = hotel.verificationStatus;

    hotel.verificationStatus = "verified";
    hotel.isVerified = true;
    hotel.verifiedBy = req.user.policeId;
    hotel.verifiedAt = new Date();
    hotel.verificationNotes = verificationNotes;

    // Add to verification history
    hotel.verificationHistory.push({
      status: "verified",
      changedBy: req.user.policeId,
      changedAt: new Date(),
      notes: verificationNotes || "Hotel verified by police",
      officerInfo: {
        name: req.user.name,
        badgeNumber: req.user.badgeNumber,
        station: req.user.station,
        rank: req.user.rank,
      },
    });

    await hotel.save();

    try {
      await logActivity(
        req.user.policeId,
        "hotel_verified",
        "hotel",
        hotel._id,
        {
          hotelName: hotel.name,
          ownerName: hotel.ownerName,
          verifiedBy: req.user.name,
          verificationNotes: verificationNotes || "Hotel verified by police",
          previousStatus: previousStatus,
          newStatus: "verified",
        },
        req
      );
      console.log(
        `✅ Hotel verification logged: ${hotel.name} verified by ${req.user.name}`
      );
    } catch (logError) {
      console.error("❌ Failed to log verification activity:", logError);
    }

    res.json({
      message: "Hotel verified successfully",
      hotel: {
        id: hotel._id,
        name: hotel.name,
        verificationStatus: hotel.verificationStatus,
        isVerified: hotel.isVerified,
        verifiedAt: hotel.verifiedAt,
        verificationNotes: hotel.verificationNotes,
      },
    });
  } catch (error) {
    console.error("Hotel verification error:", error);
    res.status(500).json({
      error: "Failed to verify hotel",
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "New password must be at least 6 characters long",
      });
    }

    const hotel = await Hotel.findById(req.hotelId);

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      hotel.password
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        error: "Current password is incorrect",
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    hotel.password = hashedNewPassword;
    await hotel.save();

    res.json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      error: "Failed to change password",
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.hotelId);

    if (!hotel || !hotel.isActive) {
      return res.status(401).json({
        error: "Hotel not found or inactive",
      });
    }

    const newToken = generateToken(hotel._id);

    res.json({
      message: "Token refreshed successfully",
      token: newToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({
      error: "Failed to refresh token",
    });
  }
};

const logoutHotel = async (req, res) => {
  try {
    res.json({
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: "Logout failed",
    });
  }
};

const getHotelStats = async (req, res) => {
  try {
    const Guest = require("../models/Guest");
    const Alert = require("../models/Alert");

    const [
      totalGuests,
      activeGuests,
      todayCheckIns,
      todayCheckOuts,
      pendingAlerts,
      totalRevenue,
    ] = await Promise.all([
      Guest.countDocuments({ hotelId: req.hotelId }),
      Guest.countDocuments({ hotelId: req.hotelId, isActive: true }),
      Guest.countDocuments({
        hotelId: req.hotelId,
        checkInDate: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      }),
      Guest.countDocuments({
        hotelId: req.hotelId,
        checkOutDate: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      }),
      Alert.countDocuments({
        hotelId: req.hotelId,
        status: { $in: ["Pending", "In Progress"] },
      }),
      Guest.aggregate([
        { $match: { hotelId: req.hotel._id } },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } },
      ]),
    ]);

    res.json({
      stats: {
        totalGuests,
        activeGuests,
        todayCheckIns,
        todayCheckOuts,
        pendingAlerts,
        totalRevenue: totalRevenue[0]?.total || 0,
        occupancyRate: Math.round(
          (activeGuests / req.hotel.numberOfRooms) * 100
        ),
      },
    });
  } catch (error) {
    console.error("Get hotel stats error:", error);
    res.status(500).json({
      error: "Failed to fetch hotel statistics",
    });
  }
};

// Updated getAllHotels to include verification status in response
// controllers/hotelAuthController.js - FIXED getAllHotels function
const getAllHotels = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      isActive = null,
      registeredByPolice = null,
      verificationStatus = null,
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { ownerName: { $regex: search, $options: "i" } },
      ];
    }

    if (isActive !== null) {
      filter.isActive = isActive === "true";
    }

    if (registeredByPolice !== null) {
      filter.registeredByPolice = registeredByPolice === "true";
    }

    if (verificationStatus !== null) {
      filter.verificationStatus = verificationStatus;
    }

    const skip = (page - 1) * limit;

    // FIXED: Helper function to check if a value is a valid ObjectId
    const isValidObjectId = (id) => {
      return id && typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
    };

    const [hotels, totalCount] = await Promise.all([
      Hotel.find(filter)
        .select("-password")
        .sort({ registrationDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Hotel.countDocuments(filter),
    ]);

    // FIXED: Post-process to handle mixed ID types and populate manually if needed
    const processedHotels = hotels.map((hotel) => {
      // Handle verifiedBy field
      if (hotel.verifiedBy) {
        if (!isValidObjectId(hotel.verifiedBy.toString())) {
          // If it's not a valid ObjectId, it's probably a string ID
          hotel.verifiedByInfo = hotel.policeOfficer || {
            id: hotel.verifiedBy,
            name: "Unknown Officer",
            badgeNumber: "N/A",
          };
          hotel.verifiedBy = null; // Clear invalid ObjectId
        }
      }

      // Handle registeredBy field
      if (hotel.registeredBy) {
        if (!isValidObjectId(hotel.registeredBy.toString())) {
          // If it's not a valid ObjectId, use policeOfficer info
          hotel.registeredByInfo = hotel.policeOfficer || {
            id: hotel.registeredBy,
            name: "Unknown Officer",
            badgeNumber: "N/A",
          };
          hotel.registeredBy = null; // Clear invalid ObjectId
        }
      }

      return hotel;
    });

    // FIXED: Now populate only valid ObjectIds
    const hotelIds = processedHotels.map((h) => h._id);

    // Get hotels with valid ObjectId references for population
    const hotelsWithValidRefs = await Hotel.find({
      _id: { $in: hotelIds },
      $or: [
        { verifiedBy: { $type: "objectId" } },
        { registeredBy: { $type: "objectId" } },
      ],
    })
      .populate("verifiedBy", "name badgeNumber station rank")
      .populate("registeredBy", "name badgeNumber station rank")
      .select("_id verifiedBy registeredBy")
      .lean();

    // Merge populated data back
    const populatedMap = new Map();
    hotelsWithValidRefs.forEach((hotel) => {
      populatedMap.set(hotel._id.toString(), hotel);
    });

    const finalHotels = processedHotels.map((hotel) => {
      const populated = populatedMap.get(hotel._id.toString());
      if (populated) {
        return {
          ...hotel,
          verifiedBy: populated.verifiedBy || hotel.verifiedByInfo,
          registeredBy: populated.registeredBy || hotel.registeredByInfo,
        };
      }
      return {
        ...hotel,
        verifiedBy: hotel.verifiedByInfo,
        registeredBy: hotel.registeredByInfo,
      };
    });

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
        hotels: finalHotels,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get hotels error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch hotels",
      message: error.message,
    });
  }
};

module.exports = {
  registerHotel,
  loginHotel,
  getHotelProfile,
  updateHotelProfile,
  changePassword,
  refreshToken,
  logoutHotel,
  getHotelStats,
  getAllHotels,
  verifyHotel,
  updateVerificationStatus,
};
