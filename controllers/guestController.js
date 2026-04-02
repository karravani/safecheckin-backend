// controllers/guestController.js - COMPLETE with fixed photo handling
const Guest = require("../models/Guest");
const Hotel = require("../models/Hotel");
const User = require("../models/User");
const { logActivity } = require("./activityController");
const { validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs").promises;

// INSTANT check-in with file paths (not GridFS)
const checkInGuest = async (req, res) => {
  try {
    console.log("=== INSTANT Check-in Process Started ===");
    const startTime = Date.now();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error("❌ Validation errors:", errors.array());

      // Clean up uploaded files on validation error
      if (req.files) {
        await cleanupUploadedFiles(req.files);
      }

      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const hotelId = req.user.hotelId;
    const userId = req.user.id;

    console.log("Hotel ID:", hotelId);
    console.log("User ID:", userId);

    // Verify hotel exists and is active
    const hotel = await Hotel.findById(hotelId);
    if (!hotel || !hotel.isActive) {
      console.error("❌ Hotel not found or inactive");
      if (req.files) {
        await cleanupUploadedFiles(req.files);
      }
      return res.status(404).json({
        success: false,
        message: "Hotel not found or inactive",
      });
    }

    console.log("✅ Hotel verified:", hotel.name);

    // Check for existing guest with same phone or ID in the hotel
    const firstGuestId = req.body.guests?.[0]?.idNumber;
    const existingGuest = await Guest.checkUniqueness(
      hotelId,
      req.body.phone,
      firstGuestId
    );

    if (existingGuest) {
      console.error("❌ Duplicate guest found");
      if (req.files) {
        await cleanupUploadedFiles(req.files);
      }
      return res.status(409).json({
        success: false,
        message:
          "Guest with this phone number or ID already exists in the hotel",
        existingGuest: {
          id: existingGuest._id,
          name: existingGuest.name,
          roomNumber: existingGuest.roomNumber,
          status: existingGuest.status,
        },
      });
    }

    // Check if room is already occupied
    const roomOccupied = await Guest.findByRoom(hotelId, req.body.roomNumber);
    if (roomOccupied.length > 0) {
      console.error("❌ Room already occupied");
      if (req.files) {
        await cleanupUploadedFiles(req.files);
      }
      return res.status(409).json({
        success: false,
        message: `Room ${req.body.roomNumber} is already occupied`,
      });
    }

    console.log("✅ Room availability verified");

    // Create guest data with file paths (INSTANT - no GridFS processing)
    const guestData = {
      ...req.body,
      hotelId,
      createdBy: userId,
      checkInTime: new Date(),
      photos: req.photoPaths || {}, // File paths stored instantly during upload
    };

    console.log("Creating guest with photos:", {
      name: guestData.name,
      roomNumber: guestData.roomNumber,
      photosUploaded: Object.keys(req.photoPaths || {}),
      photoDetails: Object.entries(req.photoPaths || {}).map(([key, val]) => ({
        type: key,
        filename: val.filename,
        path: val.path,
      })),
    });

    // INSTANT database save (no file processing delays)
    const guest = new Guest(guestData);
    await guest.save();

    const processingTime = Date.now() - startTime;
    console.log(
      `✅ Guest saved to database in ${processingTime}ms with ID:`,
      guest._id
    );

    // Log guest check-in activity
    const photoInfo = {
      hasGuestPhoto: !!req.photoPaths?.guestPhoto,
      hasIdFront: !!req.photoPaths?.idFront,
      hasIdBack: !!req.photoPaths?.idBack,
      totalPhotos: Object.keys(req.photoPaths || {}).length,
    };

    await logActivity(
      req.user.policeId || userId,
      "guest_checked",
      "guest",
      guest._id,
      {
        guestName: guest.name,
        roomNumber: guest.roomNumber,
        hotelName: hotel.name,
        checkInDate: guest.checkInTime,
        numberOfGuests: guest.guests?.length || 1,
        action: "check_in",
        photos: photoInfo,
        processingTimeMs: processingTime,
      },
      req
    );

    // Check if guest should be flagged
    const shouldFlag = await checkGuestForFlags(guest);
    if (shouldFlag.flag) {
      guest.isFlagged = true;
      guest.flagReason = shouldFlag.reason;
      await guest.save();

      await logActivity(
        req.user.policeId || userId,
        "guest_flagged",
        "guest",
        guest._id,
        {
          guestName: guest.name,
          flagReason: shouldFlag.reason,
          hotelName: hotel.name,
          autoFlagged: true,
        },
        req
      );
    }

    // Populate the response
    try {
      await guest.populate([
        { path: "hotelId", select: "name address" },
        { path: "createdBy", select: "name email", model: "User" },
      ]);
    } catch (populateError) {
      console.warn("Population failed:", populateError);
    }

    const totalTime = Date.now() - startTime;
    console.log(`🎉 Check-in completed in ${totalTime}ms - INSTANT SUCCESS!`);

    res.status(201).json({
      success: true,
      message: "Guest checked in successfully",
      data: guest,
      performance: {
        processingTimeMs: totalTime,
        photosUploaded: Object.keys(req.photoPaths || {}).length,
      },
    });
  } catch (error) {
    console.error("💥 Error in checkInGuest:", error);

    // Clean up any uploaded files if there's an error
    if (req.files) {
      await cleanupUploadedFiles(req.files);
    }

    res.status(500).json({
      success: false,
      message: "Error checking in guest",
      error: error.message,
    });
  }
};

// Get photo by guest ID and photo type
const getPhoto = async (req, res) => {
  try {
    const { guestId, photoType } = req.params;
    const hotelId = req.user.hotelId;

    console.log("📷 Photo request:", { guestId, photoType, hotelId });

    // Find guest
    const guest = await Guest.findOne({ _id: guestId, hotelId });
    if (!guest) {
      return res.status(404).json({
        success: false,
        message: "Guest not found",
      });
    }

    // Get photo info
    const photoInfo = guest.photos?.[photoType];
    if (!photoInfo || !photoInfo.path) {
      console.log("❌ Photo not found for type:", photoType);
      return res.status(404).json({
        success: false,
        message: "Photo not found for this guest",
      });
    }

    // Construct full file path
    const filePath = path.join(__dirname, "..", photoInfo.path);

    console.log("📁 Looking for file at:", filePath);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      console.log("❌ File not found on disk:", filePath);
      return res.status(404).json({
        success: false,
        message: "Photo file not found on disk",
      });
    }

    console.log("✅ File found, serving:", photoInfo.filename);

    // Serve the file
    const ext = path.extname(photoInfo.filename || "").toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    const mimeType = mimeTypes[ext] || "image/jpeg";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${photoInfo.filename}"`
    );

    res.sendFile(filePath);
  } catch (error) {
    console.error("Error serving guest photo:", error);
    res.status(500).json({
      success: false,
      message: "Error serving photo",
      error: error.message,
    });
  }
};

// Get photo by path (direct)
const getPhotoByPath = async (req, res) => {
  try {
    const { filename } = req.params;
    console.log("📸 Direct photo request:", filename);

    // Security: prevent directory traversal
    if (filename.includes("..") || filename.includes("/")) {
      return res.status(403).json({
        success: false,
        message: "Invalid file path",
      });
    }

    const filePath = path.join(__dirname, "../uploads", filename);

    console.log("📁 Looking for file at:", filePath);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      console.log("❌ File not found:", filePath);
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }

    console.log("✅ File found, serving:", filename);

    // Set proper headers
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Send file directly
    res.sendFile(filePath);
  } catch (error) {
    console.error("Error serving photo:", error);
    res.status(500).json({
      success: false,
      message: "Error serving photo",
      error: error.message,
    });
  }
};

// Helper function to clean up uploaded files
const cleanupUploadedFiles = async (files) => {
  try {
    const allFiles = [];

    // Collect all uploaded files
    Object.values(files).forEach((fileArray) => {
      if (Array.isArray(fileArray)) {
        allFiles.push(...fileArray);
      }
    });

    // Delete each file
    for (const file of allFiles) {
      try {
        await fs.unlink(file.path);
        console.log(`🧹 Cleaned up file: ${file.filename}`);
      } catch (deleteError) {
        console.warn(
          `Could not delete file ${file.filename}:`,
          deleteError.message
        );
      }
    }
  } catch (error) {
    console.error("Error during file cleanup:", error);
  }
};

// Helper function to check if guest should be flagged
const checkGuestForFlags = async (guest) => {
  try {
    const flagCriteria = [
      guest.guests && guest.guests.length > 6, // Too many guests
    ];

    for (let criterion of flagCriteria) {
      if (criterion) {
        return {
          flag: true,
          reason: "Suspicious activity detected - large group",
        };
      }
    }

    return { flag: false };
  } catch (error) {
    console.error("Error in checkGuestForFlags:", error);
    return { flag: false };
  }
};

// Check out guest
const checkOutGuest = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const userId = req.user.id;
    const { id } = req.params;
    const { checkOutDate, finalAmount, notes } = req.body;

    const guest = await Guest.findOne({ _id: id, hotelId });

    if (!guest) {
      return res.status(404).json({
        success: false,
        message: "Guest not found",
      });
    }

    if (guest.status === "checked-out") {
      return res.status(400).json({
        success: false,
        message: "Guest is already checked out",
      });
    }

    const hotel = await Hotel.findById(hotelId);
    const previousStatus = guest.status;

    guest.status = "checked-out";
    guest.checkOutDate = checkOutDate ? new Date(checkOutDate) : new Date();
    guest.updatedBy = userId;

    if (finalAmount !== undefined) {
      guest.totalAmount = finalAmount;
      guest.updateBalance();
    }

    if (notes) {
      guest.notes = notes;
    }

    await guest.save();

    await logActivity(
      req.user.policeId || userId,
      "guest_checked",
      "guest",
      guest._id,
      {
        guestName: guest.name,
        roomNumber: guest.roomNumber,
        hotelName: hotel?.name,
        checkOutDate: guest.checkOutDate,
        finalAmount: guest.totalAmount,
        previousStatus,
        action: "check_out",
      },
      req
    );

    try {
      await guest.populate([
        { path: "createdBy", select: "name email", model: "User" },
        { path: "updatedBy", select: "name email", model: "User" },
      ]);
    } catch (populateError) {
      console.warn("Population failed for checkout:", populateError);
    }

    res.json({
      success: true,
      message: "Guest checked out successfully",
      data: guest,
    });
  } catch (error) {
    console.error("Error in checkOutGuest:", error);
    res.status(500).json({
      success: false,
      message: "Error checking out guest",
      error: error.message,
    });
  }
};

// Update guest information
const updateGuest = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const userId = req.user.id;
    const { id } = req.params;

    const guest = await Guest.findOne({ _id: id, hotelId });

    if (!guest) {
      return res.status(404).json({
        success: false,
        message: "Guest not found",
      });
    }

    if (guest.status === "checked-out") {
      return res.status(400).json({
        success: false,
        message: "Cannot update checked-out guest",
      });
    }

    const previousData = {
      name: guest.name,
      phone: guest.phone,
      roomNumber: guest.roomNumber,
      status: guest.status,
    };

    const updatedFields = [];
    Object.keys(req.body).forEach((key) => {
      if (
        req.body[key] !== undefined &&
        key !== "hotelId" &&
        key !== "createdBy" &&
        guest[key] !== req.body[key]
      ) {
        guest[key] = req.body[key];
        updatedFields.push(key);
      }
    });

    guest.updatedBy = userId;
    await guest.save();

    if (updatedFields.length > 0) {
      const hotel = await Hotel.findById(hotelId);

      await logActivity(
        req.user.policeId || userId,
        "suspect_updated",
        "guest",
        guest._id,
        {
          guestName: guest.name,
          hotelName: hotel?.name,
          updatedFields,
          previousData,
          newData: req.body,
        },
        req
      );
    }

    try {
      await guest.populate([
        { path: "createdBy", select: "name email", model: "User" },
        { path: "updatedBy", select: "name email", model: "User" },
      ]);
    } catch (populateError) {
      console.warn("Population failed for update:", populateError);
    }

    res.json({
      success: true,
      message: "Guest updated successfully",
      data: guest,
    });
  } catch (error) {
    console.error("Error in updateGuest:", error);
    res.status(500).json({
      success: false,
      message: "Error updating guest",
      error: error.message,
    });
  }
};

// Get guest by ID
const getGuestById = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const { id } = req.params;

    const guest = await Guest.findOne({ _id: id, hotelId });

    if (!guest) {
      return res.status(404).json({
        success: false,
        message: "Guest not found",
      });
    }

    if (req.user.policeId) {
      const hotel = await Hotel.findById(hotelId);

      await logActivity(
        req.user.policeId,
        "suspect_viewed",
        "guest",
        guest._id,
        {
          guestName: guest.name,
          roomNumber: guest.roomNumber,
          hotelName: hotel?.name,
          viewedBy: req.user.name || "Police Officer",
        },
        req
      );
    }

    try {
      await guest.populate([
        { path: "createdBy", select: "name email", model: "User" },
        { path: "updatedBy", select: "name email", model: "User" },
        { path: "hotelId", select: "name address" },
      ]);
    } catch (populateError) {
      console.warn("Population failed for guest details:", populateError);
    }

    res.json({
      success: true,
      data: guest,
    });
  } catch (error) {
    console.error("Error in getGuestById:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching guest",
      error: error.message,
    });
  }
};

// Get all guests
const getAllGuests = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const { status, page = 1, limit = 10, search, roomNumber } = req.query;

    const query = { hotelId };
    if (status) query.status = status;
    if (roomNumber) query.roomNumber = roomNumber;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { roomNumber: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const guests = await Guest.find(query)
      .sort({ checkInTime: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const populatedGuests = [];
    for (const guest of guests) {
      try {
        await guest.populate([
          { path: "createdBy", select: "name email", model: "User" },
          { path: "updatedBy", select: "name email", model: "User" },
          { path: "hotelId", select: "name" },
        ]);
        populatedGuests.push(guest);
      } catch (populateError) {
        console.warn(
          `Population failed for guest ${guest._id}:`,
          populateError
        );
        populatedGuests.push(guest);
      }
    }

    const total = await Guest.countDocuments(query);

    res.json({
      success: true,
      guests: populatedGuests,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalGuests: total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error in getAllGuests:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching guests",
      error: error.message,
    });
  }
};

// Validate uniqueness
const validateUniqueness = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const { phone, idNumber, excludeId } = req.query;

    if (!phone && !idNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number or ID number is required",
      });
    }

    const query = {
      hotelId,
      status: { $ne: "checked-out" },
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    if (phone && idNumber) {
      query.$or = [{ phone }, { "guests.idNumber": idNumber }];
    } else if (phone) {
      query.phone = phone;
    } else {
      query["guests.idNumber"] = idNumber;
    }

    const existingGuest = await Guest.findOne(query);

    res.json({
      success: true,
      isUnique: !existingGuest,
      conflictType: existingGuest
        ? existingGuest.phone === phone
          ? "phone"
          : "id"
        : null,
      existingGuest: existingGuest
        ? {
            id: existingGuest._id,
            name: existingGuest.name,
            roomNumber: existingGuest.roomNumber,
            status: existingGuest.status,
          }
        : null,
    });
  } catch (error) {
    console.error("Error in validateUniqueness:", error);
    res.status(500).json({
      success: false,
      message: "Error validating uniqueness",
      error: error.message,
    });
  }
};

// Get guest by room
const getGuestByRoom = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const { roomNumber, status = "checked-in" } = req.query;

    if (!roomNumber) {
      return res.status(400).json({
        success: false,
        message: "Room number is required",
      });
    }

    const guests = await Guest.findByRoom(hotelId, roomNumber, status);

    res.json({
      success: true,
      data: guests,
      count: guests.length,
    });
  } catch (error) {
    console.error("Error in getGuestByRoom:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching guests by room",
      error: error.message,
    });
  }
};

// Get all guests by room
const getAllGuestsByRoom = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const { status = "checked-in" } = req.query;

    const guests = await Guest.find({ hotelId, status }).sort({
      roomNumber: 1,
      checkInTime: -1,
    });

    for (const guest of guests) {
      try {
        await guest.populate("createdBy", "name email");
      } catch (populateError) {
        console.warn(
          `Population failed for guest ${guest._id}:`,
          populateError
        );
      }
    }

    const guestsByRoom = guests.reduce((acc, guest) => {
      if (!acc[guest.roomNumber]) {
        acc[guest.roomNumber] = [];
      }
      acc[guest.roomNumber].push(guest);
      return acc;
    }, {});

    res.json({
      success: true,
      data: guestsByRoom,
      totalRooms: Object.keys(guestsByRoom).length,
      totalGuests: guests.length,
    });
  } catch (error) {
    console.error("Error in getAllGuestsByRoom:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching guests by room",
      error: error.message,
    });
  }
};

module.exports = {
  checkInGuest,
  getAllGuests,
  validateUniqueness,
  getGuestById,
  getGuestByRoom,
  getAllGuestsByRoom,
  checkOutGuest,
  updateGuest,
  getPhoto,
  getPhotoByPath,
};
