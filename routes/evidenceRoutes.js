// routes/evidenceRoutes.js - FIXED AUTHENTICATION
const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/evidenceController");

// ⚠️ IMPORTANT: Import BOTH auth middlewares
const { authenticateHotel } = require("../middleware/hotelAuth"); // Hotel auth
const { authenticatePolice } = require("../middleware/policeAuth"); // Police auth

// ========== HOTEL ROUTES ========== //
// Upload evidence (using hotel auth) - AUTOMATICALLY SHARES WITH POLICE
router.post(
  "/upload/:suspectId",
  authenticateHotel, // ✅ Hotel authentication
  upload.array("files", 5),
  async (req, res, next) => {
    // First upload the evidence
    await uploadEvidence(req, res);

    // If upload was successful, automatically share with all police
    if (res.statusCode === 201 && req.evidence) {
      try {
        // Auto-share with police by adding to sharedWith array
        req.evidence.sharedWith.push({
          role: "Police",
          accessLevel: "View",
          sharedAt: new Date(),
          canForward: true,
          sharedBy: {
            name: req.user.name || "Hotel Staff",
            role: req.user.role || "Hotel",
          },
        });

        req.evidence.chainOfCustody.push({
          action: "Auto-Shared with Police",
          performedBy: {
            userId: req.user._id || req.user.id,
            name: req.user.name || "Hotel Staff",
            role: req.user.role || "Hotel",
          },
          timestamp: new Date(),
          notes: "Evidence automatically shared with police upon upload",
          ipAddress: req.ip,
        });

        await req.evidence.save();
        console.log("✅ Evidence auto-shared with police");
      } catch (err) {
        console.error("⚠️ Failed to auto-share:", err);
      }
    }
  }
);

// Get evidence by suspect (hotel can view their own)
router.get("/suspect/:suspectId", authenticateHotel, getEvidenceBySuspect);

// Share evidence with police
router.post("/share/:evidenceId", authenticateHotel, shareEvidence);

// Get evidence statistics
router.get("/stats/overview", authenticateHotel, getEvidenceStats);

// Download file (hotel can download)
router.get("/download/:evidenceId/:fileIndex", authenticateHotel, downloadFile);

// Delete evidence
router.delete("/:evidenceId", authenticateHotel, deleteEvidence);

// ========== POLICE ROUTES ========== //
// Get shared evidence (police view)
router.get("/shared/:suspectId", authenticatePolice, getSharedEvidence);

// Approve evidence
router.put("/approve/:evidenceId", authenticatePolice, approveEvidence);

// Reject evidence
router.put("/reject/:evidenceId", authenticatePolice, rejectEvidence);

// Download file (police can download)
router.get(
  "/police/download/:evidenceId/:fileIndex",
  authenticatePolice,
  downloadFile
);

module.exports = router;
