// middleware/roleAuth.js - New file for role-based access control
const jwt = require("jsonwebtoken");
const Police = require("../models/Police");

const requireAdminPolice = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access denied. No token provided.",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "default-secret-change-in-production"
    );

    if (decoded.policeRole !== "admin_police") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin police role required.",
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Invalid token.",
    });
  }
};

const requireSubPolice = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access denied. No token provided.",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "default-secret-change-in-production"
    );

    if (decoded.policeRole !== "sub_police") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Sub police role required.",
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Invalid token.",
    });
  }
};

const requireAnyPolice = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access denied. No token provided.",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "default-secret-change-in-production"
    );

    if (!["admin_police", "sub_police"].includes(decoded.policeRole)) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Police role required.",
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Invalid token.",
    });
  }
};

module.exports = {
  requireAdminPolice,
  requireSubPolice,
  requireAnyPolice,
};
