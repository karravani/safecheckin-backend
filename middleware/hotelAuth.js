// middleware/hotelAuth.js - FIXED VERSION
const jwt = require("jsonwebtoken");

const authenticateHotel = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      console.error("❌ No token provided in request");
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    console.log("🔑 Token received (first 20 chars):", token.substring(0, 20));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token decoded successfully:", {
      role: decoded.role,
      id: decoded.id || decoded._id,
      hotelId: decoded.hotelId,
    });

    // ✅ SUPER FLEXIBLE: Check if token has hotel-related data
    const isHotelUser =
      decoded.role?.toLowerCase().includes("hotel") || // Role contains "hotel"
      decoded.hotelId || // Has hotelId field
      decoded.hotelName || // Has hotelName field
      decoded.type === "hotel" || // Type is hotel
      decoded.userType === "hotel"; // UserType is hotel

    if (!isHotelUser) {
      console.error("❌ Not a hotel user. Token data:", {
        role: decoded.role,
        hotelId: decoded.hotelId,
        type: decoded.type,
        userType: decoded.userType,
        allFields: Object.keys(decoded),
      });
      return res.status(403).json({
        success: false,
        error: "Access denied. Hotel role required.",
        receivedRole: decoded.role,
        tokenFields: Object.keys(decoded),
      });
    }

    console.log("✅ Hotel role verified:", decoded.role);

    // Attach user info to request
    req.user = {
      _id: decoded.id || decoded._id || decoded.hotelId,
      id: decoded.id || decoded._id || decoded.hotelId,
      name: decoded.name || decoded.hotelName || "Hotel Staff",
      role: decoded.role,
      hotelId: decoded.hotelId || decoded.id || decoded._id,
      email: decoded.email,
    };

    req.hotelId = decoded.hotelId || decoded.id || decoded._id;

    console.log("✅ Hotel authenticated:", {
      userId: req.user.id,
      hotelId: req.hotelId,
      role: req.user.role,
    });

    next();
  } catch (error) {
    console.error("❌ Hotel auth error:", error.message);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Token expired. Please log in again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        error: "Invalid token format.",
      });
    }

    res.status(401).json({
      success: false,
      error: "Authentication failed",
      message: error.message,
    });
  }
};

module.exports = { authenticateHotel };
