// server.js - UPDATED WITH EVIDENCE ROUTES
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load environment variables
dotenv.config();

// Check for optional middleware
const securityMiddleware = fs.existsSync("./middleware/security.js")
  ? require("./middleware/security")
  : {
      securityHeaders: (req, res, next) => next(),
      sanitizeInput: (req, res, next) => next(),
      apiRateLimit: (req, res, next) => next(),
    };

const { securityHeaders, sanitizeInput, apiRateLimit } = securityMiddleware;

// Route imports
const hotelRoutes = require("./routes/hotelRoutes");
const guestRoutes = require("./routes/guestRoutes");
const alertRoutes = require("./routes/alertRoutes");
const reportRoutes = require("./routes/reportRoutes");
const policeRoutes = require("./routes/policeRoutes");
const policeAlertRoutes = require("./routes/policeAlertRoutes");
const activityRoutes = require("./routes/activityRoutes");
const suspectRoutes = require("./routes/suspectRoutes");
const hotelSuspectRoutes = require("./routes/hotelSuspectRoutes");

// ⭐ NEW: Evidence routes
const evidenceRoutes = fs.existsSync("./routes/evidenceRoutes.js")
  ? require("./routes/evidenceRoutes")
  : null;

// Optional: Auth routes
const authRoutes = fs.existsSync("./routes/authRoutes.js")
  ? require("./routes/authRoutes")
  : null;

const app = express();
const PORT = process.env.PORT || 5000;

/* ────────────────────────────  SERVER SETUP  ───────────────────────────── */
const server = require("http").createServer(app);

// ========== INCREASED TIMEOUTS FOR FILE UPLOADS ========== //
app.use("/api/guests/checkin", (req, res, next) => {
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000);
  express.json({ limit: "50mb" })(req, res, () => {
    express.urlencoded({ extended: true, limit: "50mb" })(req, res, next);
  });
});

// ⭐ NEW: Evidence upload timeout
if (evidenceRoutes) {
  app.use("/api/evidence/upload", (req, res, next) => {
    req.setTimeout(300000);
    res.setTimeout(300000);
    express.json({ limit: "50mb" })(req, res, () => {
      express.urlencoded({ extended: true, limit: "50mb" })(req, res, next);
    });
  });
}

/* ═══════════════ CRITICAL: STATIC FILE SERVING FIRST ═══════════════ */
const uploadsPath = path.join(__dirname, "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  console.log("📁 Created uploads directory at:", uploadsPath);
}

// ⭐ NEW: Create evidence subdirectory
const evidencePath = path.join(uploadsPath, "evidence");
if (!fs.existsSync(evidencePath)) {
  fs.mkdirSync(evidencePath, { recursive: true });
  console.log("📁 Created evidence directory at:", evidencePath);
}

console.log("📁 Setting up static file serving from:", uploadsPath);

// Serve ALL files under /uploads/*
app.use(
  "/uploads",
  express.static(uploadsPath, {
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".mp4": "video/mp4",
        ".pdf": "application/pdf",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
      };

      res.setHeader(
        "Content-Type",
        mimeTypes[ext] || "application/octet-stream",
      );
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=31536000");
    },
    index: false,
    redirect: false,
  }),
);

/* ────────────────────────────  DEBUG ENDPOINTS  ───────────────────────────── */

// Helper function
function countFiles(structure) {
  let count = 0;
  structure.forEach((item) => {
    if (item.type === "file") count++;
    if (item.type === "directory" && item.contents) {
      count += countFiles(item.contents);
    }
  });
  return count;
}

// DEBUG: File structure endpoint
app.get("/debug/file-structure", (req, res) => {
  const walkDir = (dir, prefix = "") => {
    try {
      const files = fs.readdirSync(dir);
      const result = [];

      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        const relativePath = path.join(prefix, file);

        if (stat.isDirectory()) {
          result.push({
            type: "directory",
            name: file,
            path: relativePath,
            contents: walkDir(fullPath, relativePath),
          });
        } else {
          result.push({
            type: "file",
            name: file,
            path: relativePath,
            size: stat.size,
            url: `/uploads/${relativePath.replace(/\\/g, "/")}`,
            sizeKB: (stat.size / 1024).toFixed(2),
          });
        }
      });

      return result;
    } catch (error) {
      return [{ error: error.message }];
    }
  };

  try {
    const structure = walkDir(uploadsPath);
    const fileCount = countFiles(structure);

    res.json({
      success: true,
      uploadsPath,
      totalFiles: fileCount,
      structure,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      uploadsPath,
    });
  }
});

// DEBUG: List all uploads
app.get("/debug/uploads", (req, res) => {
  try {
    const files = fs.readdirSync(uploadsPath);
    const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));

    res.json({
      success: true,
      uploadsPath,
      exists: true,
      allFiles: files,
      imageFiles,
      totalFiles: files.length,
      recentImages: imageFiles.slice(-10),
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      uploadsPath,
    });
  }
});

// ⭐ NEW: Debug evidence files
app.get("/debug/evidence", (req, res) => {
  try {
    if (!fs.existsSync(evidencePath)) {
      return res.json({
        success: false,
        message: "Evidence directory not found",
        evidencePath,
      });
    }

    const hotels = fs.readdirSync(evidencePath);
    const evidenceStats = hotels.map((hotel) => {
      const hotelPath = path.join(evidencePath, hotel);
      const suspects = fs.existsSync(hotelPath)
        ? fs.readdirSync(hotelPath)
        : [];

      return {
        hotel,
        suspects: suspects.length,
        suspectDirs: suspects,
      };
    });

    res.json({
      success: true,
      evidencePath,
      totalHotels: hotels.length,
      hotels: evidenceStats,
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      evidencePath,
    });
  }
});

/* ─────────────────────────────  SECURITY MIDDLEWARE  ───────────────────────────── */
app.use(securityHeaders);
app.use(sanitizeInput);

/* ─────────────────────────────  CORS & BASIC MIDDLEWARE  ───────────────────────────── */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Simple request logging
app.use((req, res, next) => {
  if (
    req.path.includes("/checkin") ||
    req.path.includes("/photo") ||
    req.path.includes("/evidence")
  ) {
    console.log(`📁 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Default middleware for non-file routes
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply rate limiting EXCEPT for file uploads
app.use("/api", (req, res, next) => {
  if (
    req.path.includes("/checkin") ||
    req.path.includes("/photo") ||
    req.path.includes("/evidence/upload")
  ) {
    next();
  } else {
    apiRateLimit(req, res, next);
  }
});

/* ───────────────────────────  MONGODB CONNECTION  ────────────────────────── */
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/safecheckin";

mongoose
  .connect(MONGODB_URI, {
    maxPoolSize: 50,
    minPoolSize: 5,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 300000,
    connectTimeoutMS: 10000,
    heartbeatFrequencyMS: 10000,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  });

mongoose.set("bufferCommands", false);

/* ──────────────────────────────  ROUTES  ─────────────────────────────── */

// Health check route
app.get("/", (_req, res) => {
  res.json({
    message: "SafeCheckIn Multi-Hotel API is running!",
    version: "2.3.0",
    timestamp: new Date().toISOString(),
    status: "healthy",
    features: {
      evidenceManagement: evidenceRoutes ? "enabled" : "disabled",
      authentication: authRoutes ? "enabled" : "disabled",
    },
  });
});

// API Status
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    api: "SafeCheckIn API",
    version: "2.3.0",
    status: "🟢 Online",
    timestamp: new Date(),
    modules: {
      evidence: evidenceRoutes ? "✅" : "❌",
      auth: authRoutes ? "✅" : "❌",
    },
  });
});

// API Routes
if (authRoutes) app.use("/api/auth", authRoutes);
app.use("/api/hotels", hotelRoutes);
app.use("/api/guests", guestRoutes);
app.use("/api/alerts", alertRoutes);

// ⭐ NEW: Evidence routes
if (evidenceRoutes) {
  app.use("/api/evidence", evidenceRoutes);
  console.log("✅ Evidence routes registered at /api/evidence");
}

app.use("/api/reports", reportRoutes);
app.use("/api/police", policeRoutes);
app.use("/api/police/alerts", policeAlertRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/suspects", suspectRoutes);
app.use("/api/hotel/suspects", hotelSuspectRoutes);

/* ───────────────────────  ERROR HANDLERS  ───────────────────────────── */

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("❌ Server Error:", {
    path: req.originalUrl,
    method: req.method,
    error: error.message,
    code: error.code,
  });

  res.setHeader("Content-Type", "application/json");

  // Duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0] || "field";
    return res.status(400).json({
      success: false,
      error: `${field} already exists`,
      code: "DUPLICATE_KEY",
    });
  }

  // Validation error
  if (error.name === "ValidationError") {
    const messages = Object.values(error.errors || {}).map(
      (err) => err.message,
    );
    return res.status(400).json({
      success: false,
      error: messages.join(", "),
      code: "VALIDATION_ERROR",
    });
  }

  // File upload errors
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: "File too large. Maximum size is 50MB.",
      code: "FILE_TOO_LARGE",
    });
  }

  // Multer file type error
  if (error.message && error.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      error: error.message,
      code: "INVALID_FILE_TYPE",
    });
  }

  // Default server error
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
    code: "INTERNAL_ERROR",
  });
});

/* ───────────────────────────────  LISTEN  ─────────────────────────────── */
server.listen(PORT, () => {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`${"=".repeat(70)}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📸 Static file serving: /uploads`);
  console.log(`📂 Upload directory: ${uploadsPath}`);
  console.log(`📁 Evidence directory: ${evidencePath}`);
  console.log(
    `🔗 MongoDB: ${MONGODB_URI.includes("localhost") ? "Local" : "Remote"}`,
  );

  if (evidenceRoutes) {
    console.log(`✅ Evidence management: ENABLED`);
  } else {
    console.log(`⚠️  Evidence management: DISABLED (create evidenceRoutes.js)`);
  }

  console.log(`\n🔍 Debug endpoints:`);
  console.log(`   - http://localhost:${PORT}/debug/file-structure`);
  console.log(`   - http://localhost:${PORT}/debug/uploads`);
  console.log(`   - http://localhost:${PORT}/debug/evidence`);
  console.log(`${"=".repeat(70)}\n`);
});

// Set server timeouts
server.timeout = 300000; // 5 minutes
server.requestTimeout = 300000;
server.headersTimeout = 310000;
server.keepAliveTimeout = 65000;

/* ───────────────────────  GRACEFUL SHUTDOWN  ─────────────────────────── */
const gracefulShutdown = (signal) => {
  console.log(`\n👋 ${signal} received, shutting down...`);
  server.close(() => {
    mongoose.connection.close(() => {
      console.log("✅ Server shutdown complete");
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error("❌ Force shutdown");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = app;
