// controllers/jurisdictionController.js
//
// Mounted behind authenticatePolice + requireAnyPolice in policeRoutes.js,
// so req.user.policeId / req.user.policeRole are already available —
// no manual JWT decoding needed here.

const Hotel = require("../models/Hotel");
const Police = require("../models/Police");

const EARTH_RADIUS_KM = 6371;

// GET /api/police/jurisdiction/map-data
exports.getJurisdictionMapData = async (req, res) => {
  try {
    const policeId = req.user.policeId;
    const policeRole = req.user.policeRole;

    let adminDoc;

    if (policeRole === "admin_police") {
      adminDoc = await Police.findById(policeId);
    } else {
      // sub_police — use their managing admin's jurisdiction
      const officer = await Police.findById(policeId);
      if (!officer || !officer.managedBy) {
        return res.status(404).json({
          success: false,
          error: "No managing admin found for this officer",
        });
      }
      adminDoc = await Police.findById(officer.managedBy);
    }

    if (!adminDoc) {
      return res
        .status(404)
        .json({ success: false, error: "Admin record not found" });
    }

    const jurisdiction = adminDoc.jurisdiction || {};
    const coords = jurisdiction.center?.coordinates;
    const radiusKm = jurisdiction.radiusKm;

    // Jurisdiction not configured yet (still default [0,0])
    if (!coords || (coords[0] === 0 && coords[1] === 0) || !radiusKm) {
      return res.json({
        success: true,
        configured: false,
        message: "Jurisdiction has not been set up yet for this admin.",
      });
    }

    const hotels = await Hotel.find({
      location: {
        $geoWithin: {
          $centerSphere: [coords, radiusKm / EARTH_RADIUS_KM],
        },
      },
      isActive: true,
    }).select(
      "name location verificationStatus accommodationType numberOfRooms address.city",
    );

    const counts = {
      total: hotels.length,
      verified: hotels.filter((h) => h.verificationStatus === "verified")
        .length,
      pending: hotels.filter((h) => h.verificationStatus === "pending").length,
      unverified: hotels.filter((h) => h.verificationStatus === "unverified")
        .length,
    };

    res.json({
      success: true,
      configured: true,
      jurisdiction: {
        areaName: jurisdiction.areaName || "Unnamed Zone",
        center: coords,
        radiusKm,
      },
      hotels: hotels.map((h) => ({
        id: h._id,
        name: h.name,
        type: h.accommodationType,
        city: h.address?.city,
        rooms: h.numberOfRooms,
        status: h.verificationStatus,
        coordinates: h.location?.coordinates,
      })),
      counts,
    });
  } catch (err) {
    console.error("Jurisdiction map-data error:", err);
    res
      .status(500)
      .json({ success: false, error: "Failed to load jurisdiction data" });
  }
};
