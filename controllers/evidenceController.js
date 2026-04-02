// controllers/evidenceController.js - WITH COMPREHENSIVE ACTIVITY LOGGING
const Evidence = require("../models/Evidence");
const Guest = require("../models/Guest");
const Alert = require("../models/Alert");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;

// Check if activityController exists
let logActivity;
try {
  const activityController = require("./activityController");
  logActivity = activityController.logActivity;
} catch (err) {
  logActivity = async () => {};
}

// ========== FILE UPLOAD CONFIG ========== //
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const { suspectId, hotelId } = req.body;
    const uploadDir = path.join(
      __dirname,
      `../uploads/evidence/${hotelId}/${suspectId}`
    );

    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "audio/mpeg",
    "audio/wav",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// ========== UPLOAD EVIDENCE (AUTO-SHARE WITH POLICE) ========== //
const uploadEvidence = async (req, res) => {
  try {
    const {
      suspectId,
      alertId,
      title,
      description,
      category,
      severity = "Medium",
      tags,
      incidentDate,
    } = req.body;

    if (!suspectId || !title || !category) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: suspectId, title, category",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No files uploaded",
      });
    }

    const hotelId = req.hotelId || req.body.hotelId;
    const userId = req.user?._id || req.user?.id || req.hotelId;

    const evidence = new Evidence({
      suspectId,
      alertId,
      hotelId,
      guestId: req.body.guestId,
      title,
      description,
      category,
      severity,
      evidenceType: req.body.evidenceType || "Image",
      tags: tags ? tags.split(",") : [],
      incidentDate: incidentDate ? new Date(incidentDate) : new Date(),
      files: req.files.map((file) => ({
        fileName: file.originalname,
        fileUrl: `/uploads/evidence/${hotelId}/${suspectId}/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedBy: {
          userId: userId,
          name: req.user?.name || "Hotel Staff",
          role: req.user?.role || "Hotel",
        },
        description: req.body.fileDescription || "",
      })),
      chainOfCustody: [
        {
          action: "Evidence Uploaded",
          performedBy: {
            userId: userId,
            name: req.user?.name || "Hotel Staff",
            role: req.user?.role || "Hotel",
            badgeNumber: req.user?.badgeNumber || "",
          },
          timestamp: new Date(),
          notes: "Evidence uploaded to system",
          ipAddress: req.ip,
        },
        {
          action: "Auto-Shared with Police",
          performedBy: {
            userId: userId,
            name: req.user?.name || "Hotel Staff",
            role: req.user?.role || "Hotel",
          },
          timestamp: new Date(),
          notes: "Evidence automatically shared with police upon upload",
          ipAddress: req.ip,
        },
      ],
      sharedWith: [
        {
          userId: userId,
          role: "Hotel",
          accessLevel: "Edit",
          sharedAt: new Date(),
          sharedBy: {
            name: req.user?.name || "Hotel Staff",
            role: req.user?.role || "Hotel",
          },
        },
        {
          role: "Police",
          accessLevel: "View",
          sharedAt: new Date(),
          canForward: true,
          sharedBy: {
            name: req.user?.name || "Hotel Staff",
            role: req.user?.role || "Hotel",
          },
        },
      ],
    });

    await evidence.save();

    console.log("✅ Evidence uploaded and shared with police:", evidence._id);

    // ✅ Log evidence upload activity
    await logActivity(
      userId.toString(),
      "evidence_uploaded",
      "evidence",
      evidence._id.toString(),
      {
        title,
        category,
        severity,
        filesCount: req.files.length,
        totalSize: req.files.reduce((sum, f) => sum + f.size, 0),
        hotelId,
        suspectId,
        autoShared: true,
        uploadedBy: req.user?.name || "Hotel Staff",
      },
      req
    );

    res.status(201).json({
      success: true,
      message: "Evidence uploaded and shared with police successfully",
      evidence,
    });
  } catch (error) {
    console.error("Upload evidence error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload evidence",
      message: error.message,
    });
  }
};

// ========== GET EVIDENCE BY SUSPECT ========== //
const getEvidenceBySuspect = async (req, res) => {
  try {
    const { suspectId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [evidence, total] = await Promise.all([
      Evidence.find({ suspectId, isDeleted: false })
        .populate("hotelId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Evidence.countDocuments({ suspectId, isDeleted: false }),
    ]);

    // ✅ Log evidence viewing (police only)
    if (req.user?.policeId) {
      await logActivity(
        req.user.policeId.toString(),
        "evidence_viewed",
        "evidence",
        suspectId,
        {
          suspectId,
          evidenceCount: evidence.length,
          role: req.user.role,
          viewedBy: req.user.name,
        },
        req
      );
    }

    res.json({
      success: true,
      evidence,
      pagination: {
        total,
        pages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
      },
    });
  } catch (error) {
    console.error("Get evidence error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch evidence",
      message: error.message,
    });
  }
};

// ========== GET SHARED EVIDENCE FOR POLICE ========== //
// ========== GET SHARED EVIDENCE FOR POLICE ========== //
const getSharedEvidence = async (req, res) => {
  try {
    const { suspectId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    console.log("🔍 Police fetching evidence for suspect:", suspectId);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ✅ FIX: Query by suspectId which might be either Guest._id or Suspect._id
    const [evidence, total] = await Promise.all([
      Evidence.find({
        $or: [
          { suspectId: suspectId }, // Direct match
          { suspectId: suspectId.toString() }, // String match
          { guestId: suspectId }, // Match by guestId
        ],
        "sharedWith.role": "Police",
        isDeleted: false,
      })
        .populate("hotelId", "name address")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Evidence.countDocuments({
        $or: [
          { suspectId: suspectId },
          { suspectId: suspectId.toString() },
          { guestId: suspectId },
        ],
        "sharedWith.role": "Police",
        isDeleted: false,
      }),
    ]);

    console.log(
      `✅ Found ${evidence.length} evidence items for suspect ${suspectId}`
    );

    // Update view count
    if (evidence.length > 0) {
      await Evidence.updateMany(
        { _id: { $in: evidence.map((e) => e._id) } },
        { $inc: { viewCount: 1 } }
      );
    }

    // Log activity
    if (req.user?.policeId && evidence.length > 0) {
      await logActivity(
        req.user.policeId.toString(),
        "evidence_viewed",
        "evidence",
        suspectId,
        {
          suspectId,
          evidenceCount: evidence.length,
          sharedEvidence: true,
          viewedBy: req.user.name,
        },
        req
      );
    }

    res.json({
      success: true,
      evidence,
      pagination: {
        total,
        pages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
      },
    });
  } catch (error) {
    console.error("❌ Get shared evidence error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch shared evidence",
      message: error.message,
    });
  }
};

// ========== APPROVE EVIDENCE ========== //
const approveEvidence = async (req, res) => {
  try {
    const { evidenceId } = req.params;
    const { notes } = req.body;

    const evidence = await Evidence.findById(evidenceId);
    if (!evidence) {
      return res.status(404).json({
        success: false,
        error: "Evidence not found",
      });
    }

    evidence.status = "Approved";
    evidence.approvedBy = {
      userId: req.user?._id || req.user?.id,
      name: req.user?.name,
      timestamp: new Date(),
      notes: notes || "",
    };

    evidence.chainOfCustody.push({
      action: "Evidence Approved",
      performedBy: {
        userId: req.user?._id || req.user?.id,
        name: req.user?.name,
        role: req.user?.rank || "Police",
        badgeNumber: req.user?.badgeNumber,
      },
      timestamp: new Date(),
      notes: notes || "Evidence approved for use",
      ipAddress: req.ip,
    });

    await evidence.save();

    // ✅ Log evidence approval
    await logActivity(
      (req.user?._id || req.user?.id).toString(),
      "evidence_approved",
      "evidence",
      evidenceId,
      {
        evidenceTitle: evidence.title,
        approvedBy: req.user?.name,
        notes,
        suspectId: evidence.suspectId,
      },
      req
    );

    res.json({
      success: true,
      message: "Evidence approved",
      evidence,
    });
  } catch (error) {
    console.error("Approve evidence error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to approve evidence",
      message: error.message,
    });
  }
};

// ========== REJECT EVIDENCE ========== //
const rejectEvidence = async (req, res) => {
  try {
    const { evidenceId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: "Rejection reason is required",
      });
    }

    const evidence = await Evidence.findById(evidenceId);
    if (!evidence) {
      return res.status(404).json({
        success: false,
        error: "Evidence not found",
      });
    }

    evidence.status = "Rejected";
    evidence.rejectionReason = reason;

    evidence.chainOfCustody.push({
      action: "Evidence Rejected",
      performedBy: {
        userId: req.user?._id || req.user?.id,
        name: req.user?.name,
        role: req.user?.rank || "Police",
      },
      timestamp: new Date(),
      notes: `Rejection reason: ${reason}`,
      ipAddress: req.ip,
    });

    await evidence.save();

    // ✅ Log evidence rejection
    await logActivity(
      (req.user?._id || req.user?.id).toString(),
      "evidence_rejected",
      "evidence",
      evidenceId,
      {
        evidenceTitle: evidence.title,
        rejectedBy: req.user?.name,
        reason,
        suspectId: evidence.suspectId,
      },
      req
    );

    res.json({
      success: true,
      message: "Evidence rejected",
      evidence,
    });
  } catch (error) {
    console.error("Reject evidence error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reject evidence",
      message: error.message,
    });
  }
};

// ========== DELETE EVIDENCE ========== //
const deleteEvidence = async (req, res) => {
  try {
    const { evidenceId } = req.params;

    const evidence = await Evidence.findById(evidenceId);
    if (!evidence) {
      return res.status(404).json({
        success: false,
        error: "Evidence not found",
      });
    }

    // Delete files from disk
    for (const file of evidence.files) {
      try {
        const filePath = path.join(__dirname, `..${file.fileUrl}`);
        await fs.unlink(filePath);
        console.log("🗑️ Deleted file:", filePath);
      } catch (err) {
        console.warn("⚠️ File not found:", file.fileUrl);
      }
    }

    await Evidence.softDelete(evidenceId, req.user?._id || req.user?.id);

    // ✅ Log evidence deletion
    await logActivity(
      (req.user?._id || req.user?.id).toString(),
      "evidence_deleted",
      "evidence",
      evidenceId,
      {
        evidenceTitle: evidence.title,
        deletedBy: req.user?.name,
        filesDeleted: evidence.files.length,
        suspectId: evidence.suspectId,
      },
      req
    );

    res.json({
      success: true,
      message: "Evidence deleted",
    });
  } catch (error) {
    console.error("Delete evidence error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete evidence",
      message: error.message,
    });
  }
};

// ========== DOWNLOAD FILE ========== //
const downloadFile = async (req, res) => {
  try {
    const { evidenceId, fileIndex } = req.params;

    const evidence = await Evidence.findById(evidenceId);
    if (!evidence) {
      return res.status(404).json({
        success: false,
        error: "Evidence not found",
      });
    }

    const file = evidence.files[parseInt(fileIndex)];
    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    const filePath = path.join(__dirname, `..${file.fileUrl}`);

    try {
      await fs.access(filePath);
    } catch (err) {
      return res.status(404).json({
        success: false,
        error: "File not found on server",
      });
    }

    const userId = req.user?._id || req.user?.id;
    const hasAccess = evidence.sharedWith.some(
      (share) =>
        (share.userId?.toString() === userId?.toString() ||
          share.role === "Police" ||
          share.role === "All") &&
        ["Download", "Edit", "View"].includes(share.accessLevel)
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    await Evidence.findByIdAndUpdate(evidenceId, {
      $inc: { downloadCount: 1 },
    });

    // ✅ Log file download
    await logActivity(
      userId.toString(),
      "evidence_downloaded",
      "evidence",
      evidenceId,
      {
        fileName: file.fileName,
        fileSize: file.fileSize,
        downloadedBy: req.user?.name,
        suspectId: evidence.suspectId,
      },
      req
    );

    res.download(filePath, file.fileName);
  } catch (error) {
    console.error("Download file error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to download file",
      message: error.message,
    });
  }
};

// ========== GET EVIDENCE STATISTICS ========== //
const getEvidenceStats = async (req, res) => {
  try {
    const hotelId = req.hotelId;

    const stats = await Evidence.getStats(hotelId);
    const pendingReview = await Evidence.countDocuments({
      hotelId,
      status: "Pending Review",
      isDeleted: false,
    });

    const approved = await Evidence.countDocuments({
      hotelId,
      status: "Approved",
      isDeleted: false,
    });

    const rejected = await Evidence.countDocuments({
      hotelId,
      status: "Rejected",
      isDeleted: false,
    });

    res.json({
      success: true,
      stats,
      summary: {
        pendingReview,
        approved,
        rejected,
        totalFiles: stats.reduce((sum, s) => sum + s.count, 0),
      },
    });
  } catch (error) {
    console.error("Get evidence stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch statistics",
      message: error.message,
    });
  }
};

// ========== SHARE EVIDENCE WITH POLICE ========== //
const shareEvidence = async (req, res) => {
  try {
    const { evidenceId } = req.params;
    const { policeId, accessLevel = "View", canForward = false } = req.body;

    if (!policeId) {
      return res.status(400).json({
        success: false,
        error: "Police ID is required",
      });
    }

    const evidence = await Evidence.findById(evidenceId);
    if (!evidence) {
      return res.status(404).json({
        success: false,
        error: "Evidence not found",
      });
    }

    const alreadyShared = evidence.sharedWith.find(
      (share) => share.userId?.toString() === policeId
    );

    if (!alreadyShared) {
      evidence.sharedWith.push({
        userId: policeId,
        role: "Police",
        accessLevel,
        sharedAt: new Date(),
        canForward,
        sharedBy: {
          name: req.user?.name || "Hotel Staff",
          role: req.user?.role || "Hotel",
        },
      });

      evidence.chainOfCustody.push({
        action: "Shared with Police",
        performedBy: {
          userId: req.user?._id || req.user?.id,
          name: req.user?.name || "Hotel Staff",
          role: req.user?.role || "Hotel",
        },
        timestamp: new Date(),
        notes: `Evidence shared with police. Access level: ${accessLevel}`,
        ipAddress: req.ip,
      });

      evidence.shareCount += 1;
      await evidence.save();
    }

    // ✅ Log evidence sharing
    await logActivity(
      (req.user?._id || req.user?.id).toString(),
      "evidence_shared",
      "evidence",
      evidenceId,
      {
        evidenceTitle: evidence.title,
        sharedWith: policeId,
        accessLevel,
        canForward,
        sharedBy: req.user?.name || "Hotel Staff",
      },
      req
    );

    res.json({
      success: true,
      message: "Evidence shared successfully",
      evidence,
    });
  } catch (error) {
    console.error("Share evidence error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to share evidence",
      message: error.message,
    });
  }
};

module.exports = {
  upload,
  uploadEvidence,
  getEvidenceBySuspect,
  shareEvidence,
  getSharedEvidence,
  approveEvidence,
  rejectEvidence,
  deleteEvidence,
  downloadFile,
  getEvidenceStats,
};
