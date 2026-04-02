// middleware/security.js - NEW FILE
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

// Security headers
const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
};

// Input sanitization
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    // Remove any potential script tags
    const sanitize = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === "string") {
          obj[key] = obj[key].replace(
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            ""
          );
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };
    sanitize(req.body);
  }
  next();
};

// Enhanced rate limiting for different endpoints
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message,
      code: "RATE_LIMIT_EXCEEDED",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Different rate limits for different operations
const authRateLimit = createRateLimit(
  15 * 60 * 1000,
  1000,
  "Too many login attempts"
);
const apiRateLimit = createRateLimit(
  15 * 60 * 1000,
  1000,
  "Too many API requests"
);
const uploadRateLimit = createRateLimit(
  60 * 60 * 1000,
  1000,
  "Too many upload attempts"
);

module.exports = {
  securityHeaders,
  sanitizeInput,
  authRateLimit,
  apiRateLimit,
  uploadRateLimit,
};
