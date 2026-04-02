// routes/policeRoutes.js - UPDATED with role-based routes and new endpoints
const express = require("express");
const router = express.Router();
const {
  registerPolice,
  loginPolice,
  getPoliceProfile,
  updatePoliceProfile,
  changePolicePassword,
  refreshPoliceToken,
  getAllPoliceOfficers,
  getSubPoliceOfficers,
  getOfficerById,
  updateOfficerStatus,
  logoutPolice,
} = require("../controllers/policeAuthController");
const {
  authenticatePolice,
  requireAdminPolice,
  requireAnyPolice,
} = require("../middleware/policeAuth");

// Public routes (no authentication required)
router.post("/login", loginPolice);
router.post("/register", registerPolice);

// Protected routes (authentication required)
router.use(authenticatePolice); // All routes below require authentication

// Police profile management - any police role
router.get("/profile", requireAnyPolice, getPoliceProfile);
router.put("/profile", requireAnyPolice, updatePoliceProfile);

// Authentication management - any police role
router.post("/change-password", requireAnyPolice, changePolicePassword);
router.post("/refresh-token", requireAnyPolice, refreshPoliceToken);
router.post("/logout", requireAnyPolice, logoutPolice);

// Admin police only routes
router.get("/all", requireAdminPolice, getAllPoliceOfficers);
router.get("/sub-police", requireAdminPolice, getSubPoliceOfficers);
router.get("/officer/:officerId", requireAdminPolice, getOfficerById);
router.patch(
  "/officer/:officerId/status",
  requireAdminPolice,
  updateOfficerStatus
);

// Health check for authenticated police
router.get("/health", requireAnyPolice, (req, res) => {
  res.json({
    success: true,
    message: "Police authentication is working",
    policeId: req.user.policeId,
    role: req.user.policeRole,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
