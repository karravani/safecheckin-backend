// routes/reportRoutes.js (Fixed with Enhanced Routes)
const express = require("express");
const router = express.Router();
const { authenticatePolice } = require("../middleware/policeAuth");
const {
  getAllHotelsStats,
  getAreaWideStats,
  getHotelGuests,
  generateCustomReport,
} = require("../controllers/reportsController");

// Debug middleware to log all requests to reports routes
router.use((req, res, next) => {
  console.log(`Reports Route: ${req.method} ${req.originalUrl}`);
  console.log("Query Params:", req.query);
  console.log("User Info:", {
    policeId: req.user?.policeId,
    name: req.user?.name,
    role: req.user?.policeRole,
  });
  next();
});

// Apply police authentication to all report routes
router.use(authenticatePolice);

// Existing routes with enhanced logging
router.get("/hotels-stats", getAllHotelsStats); // GET /api/reports/hotels-stats
router.get("/area-stats", getAreaWideStats); // GET /api/reports/area-stats
router.get("/hotel/:hotelId/guests", getHotelGuests); // GET /api/reports/hotel/:hotelId/guests

// New custom report generation route
router.post("/custom", generateCustomReport); // POST /api/reports/custom

// Enhanced test route with user verification
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Reports API is working",
    user: {
      policeId: req.user?.policeId,
      name: req.user?.name,
      role: req.user?.policeRole,
      station: req.user?.station,
    },
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      "GET /api/reports/hotels-stats",
      "GET /api/reports/area-stats",
      "GET /api/reports/hotel/:hotelId/guests",
      "POST /api/reports/custom",
      "GET /api/reports/test",
    ],
  });
});

// Error handling middleware for reports
router.use((error, req, res, next) => {
  console.error("Reports route error:", error);
  res.status(500).json({
    success: false,
    error: "Reports system error",
    message: error.message,
  });
});

module.exports = router;
