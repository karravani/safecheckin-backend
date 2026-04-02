// middleware/policeAuth.js - ENHANCED VERSION
const jwt = require("jsonwebtoken");
const Police = require("../models/Police");
const { logActivity } = require("../controllers/activityController");

// Enhanced police authentication with activity tracking
// middleware/policeAuth.js - FIXED VERSION
const authenticatePolice = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Access denied. No token provided or invalid format.",
        code: "NO_TOKEN",
      });
    }

    const token = authHeader.substring(7);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access denied. Token is empty.",
        code: "EMPTY_TOKEN",
      });
    }

    const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      if (!decoded.role || decoded.role !== "police") {
        return res.status(403).json({
          success: false,
          error: "Access denied. Police role required.",
          code: "INSUFFICIENT_PERMISSIONS",
        });
      }

      const police = await Police.findById(decoded.policeId);

      if (!police) {
        return res.status(401).json({
          success: false,
          error: "Police officer not found.",
          code: "OFFICER_NOT_FOUND",
        });
      }

      if (!police.isActive) {
        return res.status(401).json({
          success: false,
          error: "Police officer account is inactive.",
          code: "INACTIVE_ACCOUNT",
        });
      }

      // FIXED: Throttle activity updates
      const now = new Date();
      const lastActivity = police.lastActivityAt || new Date(0);
      const timeDiff = now - lastActivity;
      const FIVE_MINUTES = 5 * 60 * 1000;

      if (timeDiff > FIVE_MINUTES) {
        await police.updateActivity();
      }

      req.user = {
        ...decoded,
        police: police,
        type: "police",
      };

      next();
    } catch (jwtError) {
      console.error("JWT Verification Error:", jwtError.message);

      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          error: "Token expired. Please login again.",
          code: "TOKEN_EXPIRED",
        });
      }

      if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          error: "Invalid token format.",
          code: "INVALID_TOKEN",
        });
      }

      return res.status(401).json({
        success: false,
        error: "Token verification failed.",
        code: "TOKEN_VERIFICATION_FAILED",
      });
    }
  } catch (error) {
    console.error("Police Auth Middleware Error:", error);
    return res.status(500).json({
      success: false,
      error: "Authentication server error.",
      code: "AUTH_SERVER_ERROR",
    });
  }
};


// Enhanced role-based middleware
const requireAdminPolice = (req, res, next) => {
  if (req.user.policeRole !== "admin_police") {
    return res.status(403).json({
      success: false,
      error: "Access denied. Admin police role required.",
      code: "ADMIN_ACCESS_REQUIRED",
    });
  }
  next();
};

const requireSubPolice = (req, res, next) => {
  if (req.user.policeRole !== "sub_police") {
    return res.status(403).json({
      success: false,
      error: "Access denied. Sub police role required.",
      code: "SUB_POLICE_ACCESS_REQUIRED",
    });
  }
  next();
};

const requireAnyPolice = (req, res, next) => {
  if (!["admin_police", "sub_police"].includes(req.user.policeRole)) {
    return res.status(403).json({
      success: false,
      error: "Access denied. Police role required.",
      code: "POLICE_ACCESS_REQUIRED",
    });
  }
  next();
};

// Enhanced activity logging for police actions
const logPoliceActivity = (action, targetType) => {
  return async (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      // Log activity after successful response
      if (data.success && req.user && req.user.policeId) {
        const targetId =
          req.params.id ||
          req.params.hotelId ||
          req.params.officerId ||
          req.params.suspectId ||
          req.params.alertId ||
          (data.data && data.data.id) ||
          `police_action_${Date.now()}`;

        // Enhanced activity details
        const activityDetails = {
          method: req.method,
          path: req.path,
          officerName: req.user.name,
          officerRank: req.user.rank,
          station: req.user.station,
          timestamp: new Date(),
          ...(req.body &&
            Object.keys(req.body).length > 0 && { requestBody: req.body }),
        };

        // Log asynchronously
        logActivity(
          req.user.policeId.toString(),
          action,
          targetType,
          targetId.toString(),
          activityDetails,
          req
        ).catch((err) => console.error("Police activity logging failed:", err));
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

// Permission-based middleware
const requirePermission = (permission) => {
  return (req, res, next) => {
    const police = req.user.police;

    if (!police || !police.permissions || !police.permissions[permission]) {
      return res.status(403).json({
        success: false,
        error: `Access denied. ${permission} permission required.`,
        code: "PERMISSION_DENIED",
      });
    }

    next();
  };
};

module.exports = {
  authenticatePolice,
  requireAdminPolice,
  requireSubPolice,
  requireAnyPolice,
  logPoliceActivity,
  requirePermission,
};
