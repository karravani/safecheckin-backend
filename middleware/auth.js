// middleware/auth.js - COMPLETE OPTIMIZED VERSION
const jwt = require("jsonwebtoken");
const Hotel = require("../models/Hotel");
const { logActivity } = require("../controllers/activityController");

// Enhanced authentication middleware with throttled activity logging
const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access denied. No token provided.",
        code: "NO_TOKEN",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const hotel = await Hotel.findById(decoded.hotelId);

    if (!hotel) {
      return res.status(401).json({
        success: false,
        error: "Invalid token - hotel not found.",
        code: "INVALID_TOKEN",
      });
    }

    if (!hotel.isActive) {
      return res.status(401).json({
        success: false,
        error: "Hotel account is inactive.",
        code: "INACTIVE_ACCOUNT",
      });
    }

    // FIXED: Only update activity if it's been more than 5 minutes
    const now = new Date();
    const lastActivity = hotel.lastActivityAt || new Date(0);
    const timeDiff = now - lastActivity;
    const FIVE_MINUTES = 5 * 60 * 1000;

    if (timeDiff > FIVE_MINUTES) {
      try {
        // Use updateOne to avoid triggering save middleware
        await Hotel.updateOne(
          { _id: hotel._id },
          { lastActivityAt: now },
          { timestamps: false }
        );
      } catch (updateError) {
        console.warn("Failed to update hotel activity:", updateError.message);
        // Don't fail the request if activity update fails
      }
    }

    req.hotelId = hotel._id;
    req.hotel = hotel;
    req.user = {
      hotelId: hotel._id,
      id: hotel._id,
      name: hotel.name,
      type: "hotel",
    };

    next();
  } catch (error) {
    console.error("Hotel auth error:", error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Token expired. Please login again.",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        error: "Invalid token format.",
        code: "INVALID_TOKEN",
      });
    }

    res.status(401).json({
      success: false,
      error: "Authentication failed.",
      code: "AUTH_FAILED",
    });
  }
};

// Optimized rate limiter with better memory management
const rateLimiter = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  let cleanupInterval;

  // Cleanup expired entries with optimized interval
  const startCleanup = () => {
    if (cleanupInterval) clearInterval(cleanupInterval);

    cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [clientId, data] of requests.entries()) {
        if (now > data.resetTime) {
          requests.delete(clientId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} expired rate limit entries`);
      }
    }, Math.max(windowMs / 2, 60000)); // Clean every half window or minimum 1 minute
  };

  startCleanup();

  // Clean up interval on process exit
  const cleanup = () => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
    requests.clear();
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  process.on("exit", cleanup);

  return (req, res, next) => {
    const clientId =
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      "unknown";
    const now = Date.now();

    if (!requests.has(clientId)) {
      requests.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
        firstRequest: now,
      });
      return next();
    }

    const clientData = requests.get(clientId);

    // Reset if window has expired
    if (now > clientData.resetTime) {
      requests.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
        firstRequest: now,
      });
      return next();
    }

    // Check rate limit
    if (clientData.count >= maxRequests) {
      const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);

      return res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter,
        limit: maxRequests,
        windowMs: Math.floor(windowMs / 1000),
      });
    }

    clientData.count++;
    clientData.lastRequest = now;
    next();
  };
};

// Enhanced hotel access validator with caching
const validateHotelAccess = (Model, options = {}) => {
  const {
    cacheTime = 5 * 60 * 1000, // 5 minutes cache
    allowOwnershipTransfer = false,
  } = options;

  const cache = new Map();

  return async (req, res, next) => {
    try {
      const resourceId =
        req.params.id ||
        req.params.guestId ||
        req.params.alertId ||
        req.params.resourceId;

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          error: "Resource ID is required",
          code: "MISSING_RESOURCE_ID",
        });
      }

      const cacheKey = `${Model.modelName}:${resourceId}:${req.hotelId}`;
      const now = Date.now();

      // Check cache first
      if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (now - cached.timestamp < cacheTime) {
          req.resource = cached.document;
          return next();
        }
        cache.delete(cacheKey);
      }

      const document = await Model.findById(resourceId).lean();

      if (!document) {
        return res.status(404).json({
          success: false,
          error: "Resource not found",
          code: "RESOURCE_NOT_FOUND",
        });
      }

      // Check ownership
      const documentHotelId =
        document.hotelId?.toString() || document.hotel?.toString();
      const requestHotelId = req.hotelId.toString();

      if (documentHotelId !== requestHotelId) {
        return res.status(403).json({
          success: false,
          error: "Access denied. Resource belongs to different hotel.",
          code: "ACCESS_DENIED",
        });
      }

      // Cache the result
      cache.set(cacheKey, {
        document,
        timestamp: now,
      });

      // Clean cache periodically
      if (cache.size > 1000) {
        const cutoff = now - cacheTime;
        for (const [key, value] of cache.entries()) {
          if (value.timestamp < cutoff) {
            cache.delete(key);
          }
        }
      }

      req.resource = document;
      next();
    } catch (error) {
      console.error("Hotel access validation error:", error);
      res.status(500).json({
        success: false,
        error: "Server error during access validation",
        code: "SERVER_ERROR",
      });
    }
  };
};

// Optimized activity logging middleware with batching
const logHotelActivity = (action, targetType, options = {}) => {
  const {
    batchSize = 10,
    flushInterval = 30000, // 30 seconds
    onlySignificantActions = true,
  } = options;

  let activityQueue = [];
  let flushTimer = null;

  const flushActivities = async () => {
    if (activityQueue.length === 0) return;

    const batch = activityQueue.splice(0, batchSize);

    try {
      // Process activities in parallel but don't wait for completion
      const promises = batch.map((activity) =>
        logActivity(
          activity.userId,
          activity.action,
          activity.targetType,
          activity.targetId,
          activity.details,
          activity.req
        ).catch((err) =>
          console.error(
            `Activity logging failed for ${activity.action}:`,
            err.message
          )
        )
      );

      // Don't await - fire and forget
      Promise.allSettled(promises);
    } catch (error) {
      console.error("Batch activity logging error:", error);
    }

    // Schedule next flush if there are more activities
    if (activityQueue.length > 0) {
      flushTimer = setTimeout(flushActivities, 1000);
    } else {
      flushTimer = null;
    }
  };

  // Clean up on process exit
  const cleanup = () => {
    if (flushTimer) clearTimeout(flushTimer);
    if (activityQueue.length > 0) {
      // Try to flush remaining activities synchronously
      flushActivities();
    }
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  process.on("exit", cleanup);

  return async (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      // Only log significant activities or all if specified
      const significantMethods = ["POST", "PUT", "DELETE", "PATCH"];
      const shouldLog =
        !onlySignificantActions ||
        significantMethods.includes(req.method) ||
        req.path.includes("/login") ||
        req.path.includes("/register");

      if (data.success && req.user && shouldLog) {
        const targetId =
          req.params.id ||
          req.params.guestId ||
          req.params.alertId ||
          (data.data && data.data.id) ||
          `hotel_action_${Date.now()}`;

        // Add to queue instead of immediate logging
        activityQueue.push({
          userId: req.user.id.toString(),
          action,
          targetType,
          targetId: targetId.toString(),
          details: {
            method: req.method,
            path: req.path,
            hotelName: req.hotel?.name,
            timestamp: new Date(),
            userAgent: req.get("User-Agent")?.substring(0, 100),
            ip: req.ip,
          },
          req: {
            method: req.method,
            path: req.path,
            ip: req.ip,
          },
        });

        // Flush if queue is full or start timer
        if (activityQueue.length >= batchSize) {
          if (flushTimer) clearTimeout(flushTimer);
          setImmediate(flushActivities);
        } else if (!flushTimer) {
          flushTimer = setTimeout(flushActivities, flushInterval);
        }
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

// Lightweight middleware for checking if user is authenticated (no DB calls)
const requireAuth = (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access denied. No token provided.",
        code: "NO_TOKEN",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      hotelId: decoded.hotelId,
      id: decoded.hotelId,
      type: "hotel",
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Token expired. Please login again.",
        code: "TOKEN_EXPIRED",
      });
    }

    return res.status(401).json({
      success: false,
      error: "Invalid token.",
      code: "INVALID_TOKEN",
    });
  }
};

// Health check middleware for monitoring auth performance
const authHealthCheck = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      // Log slow auth requests
      console.warn(
        `🐌 Slow auth request: ${req.method} ${req.path} took ${duration}ms`
      );
    }
  });

  next();
};

const authenticateHotel = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No authentication token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!["hotel_staff", "hotel_manager"].includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Hotel role required.",
      });
    }

    req.user = decoded;
    req.hotelId = decoded.hotelId;

    next();
  } catch (error) {
    console.error("Hotel auth error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

const authenticatePolice = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No authentication token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!["police", "admin_police"].includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Police role required.",
      });
    }

    req.user = decoded;
    req.user.policeId = decoded._id || decoded.id;
    req.user.policeRole = decoded.role;

    next();
  } catch (error) {
    console.error("Police auth error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

const authenticateBoth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No authentication token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    req.hotelId = decoded.hotelId;
    req.policeId = decoded._id || decoded.id;

    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

module.exports = {
  auth,
  rateLimiter,
  validateHotelAccess,
  logHotelActivity,
  requireAuth,
  authHealthCheck,
  authenticateHotel,
  authenticatePolice,
  authenticateBoth,
};
