// routes/suspectRoutes.js - Police suspect management routes
const express = require("express");
const router = express.Router();
const {
  verifySuspect,
  getAllSuspects,
  getSuspectById,
  updateSuspectStatus,
  updateSuspectNotes,
  getSuspectsByHotel,
  getSuspectStats,
} = require("../controllers/suspectController");
const { authenticatePolice } = require("../middleware/policeAuth");

// All suspect routes require police authentication
router.use(authenticatePolice);

// ========== SUSPECT VERIFICATION ========== //
// POST /api/suspects/verify/:alertId
// Main endpoint - Police verifies a suspect from an alert
router.post("/verify/:alertId", verifySuspect);

// ========== GET ALL SUSPECTS ========== //
// GET /api/suspects
// Query params: page, limit, status, hotelId, search
router.get("/", getAllSuspects);

// ========== GET SUSPECT STATISTICS ========== //
// GET /api/suspects/stats
// Query params: hotelId (optional)
router.get("/stats", getSuspectStats);

// ========== GET SUSPECTS BY HOTEL ========== //
// GET /api/suspects/hotel/:hotelId
// For filtering suspects by specific hotel
router.get("/hotel/:hotelId", getSuspectsByHotel);

// ========== GET SUSPECT BY ID ========== //
// GET /api/suspects/:suspectId
router.get("/:suspectId", getSuspectById);

// ========== UPDATE SUSPECT STATUS ========== //
// PUT /api/suspects/:suspectId/status
// Body: { status, reason, notes }
router.put("/:suspectId/status", updateSuspectStatus);

// ========== UPDATE SUSPECT NOTES ========== //
// PUT /api/suspects/:suspectId/notes
// Body: { notes, reason }
router.put("/:suspectId/notes", updateSuspectNotes);

module.exports = router;
