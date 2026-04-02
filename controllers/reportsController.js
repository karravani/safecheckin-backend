// controllers/reportsController.js (COMPLETE FIX with Activity Logging)
const Guest = require("../models/Guest");
const Hotel = require("../models/Hotel");
const { logActivity } = require("./activityController");

// Utility: get start date for period
function getStartOfPeriod(period) {
  const now = new Date();

  switch (period) {
    case "today": {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "week": {
      const start = new Date();
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "month": {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "all": {
      return new Date(2020, 0, 1); // Far back date to include all records
    }
    default:
      return new Date(2020, 0, 1);
  }
}

// FIXED: Enhanced getAreaWideStats with activity logging
const getAreaWideStats = async (req, res) => {
  try {
    console.log("getAreaWideStats called with query:", req.query);
    const { period = "all", city, category } = req.query;
    const startDate = getStartOfPeriod(period);
    const endDate = new Date();

    console.log("Debug Info:", {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    // Build hotel query
    const hotelQuery = { isActive: true };

    if (city && city !== "all") {
      hotelQuery["address.city"] = city;
    }

    if (category && category !== "all") {
      hotelQuery.category = category;
    }

    const hotels = await Hotel.find(hotelQuery).select("_id");
    const hotelIds = hotels.map((h) => h._id);

    console.log("Found hotels:", hotelIds.length);

    if (hotelIds.length === 0) {
      return res.json({
        success: true,
        data: {
          totalCheckins: 0,
          totalCheckouts: 0,
          totalAccommodations: 0,
          totalGuests: 0,
        },
      });
    }

    // Build guest query - try multiple date fields
    const guestQuery = {
      hotelId: { $in: hotelIds },
      $or: [
        { checkInTime: { $gte: startDate, $lte: endDate } },
        { checkInDate: { $gte: startDate, $lte: endDate } },
      ],
    };

    // If period is "all", remove date filtering entirely
    if (period === "all") {
      delete guestQuery.$or;
    }

    console.log("Guest query:", JSON.stringify(guestQuery, null, 2));

    const [
      checkinsResult,
      checkoutsResult,
      totalGuestsResult,
      guestRecordsCount,
    ] = await Promise.all([
      // Count check-in records
      Guest.countDocuments(guestQuery),
      // Count check-out records
      Guest.countDocuments({
        hotelId: { $in: hotelIds },
        status: "checked-out",
        ...(period !== "all" && {
          $or: [
            { checkOutDate: { $gte: startDate, $lte: endDate } },
            { checkOutTime: { $gte: startDate, $lte: endDate } },
          ],
        }),
      }),
      // Sum the guestCount field to get actual number of guests
      Guest.aggregate([
        { $match: guestQuery },
        {
          $group: {
            _id: null,
            totalGuests: { $sum: { $ifNull: ["$guestCount", 1] } },
          },
        },
      ]),
      // For debugging: also count total guest records
      Guest.countDocuments(guestQuery),
    ]);

    const totalCheckins = checkinsResult;
    const totalCheckouts = checkoutsResult;
    const totalGuests = totalGuestsResult[0]?.totalGuests || 0;
    const totalAccommodations = hotelIds.length;

    console.log("Stats calculated:", {
      totalCheckins,
      totalCheckouts,
      totalAccommodations,
      totalGuests,
      guestRecordsCount,
    });

    // Log report generation activity
    await logActivity(
      req.user.policeId.toString(),
      "report_generated",
      "report",
      `area_stats_${Date.now()}`,
      {
        reportType: "area_wide_stats",
        period,
        city: city || "all",
        category: category || "all",
        totalHotels: hotelIds.length,
        totalCheckins,
        totalCheckouts,
        totalGuests,
      },
      req
    );

    res.json({
      success: true,
      data: {
        totalCheckins,
        totalCheckouts,
        totalAccommodations,
        totalGuests,
        metadata: {
          period,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          hotelCount: hotelIds.length,
        },
      },
    });
  } catch (error) {
    console.error("Error in getAreaWideStats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching area-wide statistics",
      error: error.message,
    });
  }
};

// FIXED: Enhanced getAllHotelsStats with activity logging
const getAllHotelsStats = async (req, res) => {
  try {
    console.log("getAllHotelsStats called with query:", req.query);
    const { period = "all", city, category } = req.query;
    const startDate = getStartOfPeriod(period);
    const endDate = new Date();

    let hotelQuery = { isActive: true };
    if (city && city !== "all") {
      hotelQuery["address.city"] = city;
    }
    if (category && category !== "all") {
      hotelQuery.category = category;
    }

    const hotels = await Hotel.find(hotelQuery).select(
      "name address ownerName phone numberOfRooms category"
    );

    console.log("Found hotels for stats:", hotels.length);

    if (hotels.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const hotelStats = await Promise.all(
      hotels.map(async (hotel) => {
        try {
          // Build guest query for this specific hotel
          const guestQuery = {
            hotelId: hotel._id,
            ...(period !== "all" && {
              $or: [
                { checkInTime: { $gte: startDate, $lte: endDate } },
                { checkInDate: { $gte: startDate, $lte: endDate } },
              ],
            }),
          };

          const [checkins, checkouts, totalGuestsResult, guestRecords] =
            await Promise.all([
              // Count check-in records
              Guest.countDocuments(guestQuery),
              // Count check-out records
              Guest.countDocuments({
                hotelId: hotel._id,
                status: "checked-out",
                ...(period !== "all" && {
                  $or: [
                    { checkOutDate: { $gte: startDate, $lte: endDate } },
                    { checkOutTime: { $gte: startDate, $lte: endDate } },
                  ],
                }),
              }),
              // Sum guestCount to get actual number of guests
              Guest.aggregate([
                { $match: guestQuery },
                {
                  $group: {
                    _id: null,
                    totalGuests: { $sum: { $ifNull: ["$guestCount", 1] } },
                  },
                },
              ]),
              // For debugging: count guest records
              Guest.countDocuments(guestQuery),
            ]);

          const totalGuests = totalGuestsResult[0]?.totalGuests || 0;

          console.log(`Hotel ${hotel.name} stats:`, {
            checkins,
            checkouts,
            totalGuests,
            guestRecords,
          });

          return {
            id: hotel._id.toString(),
            name: hotel.name,
            address: hotel.address?.street || hotel.address || "",
            city: hotel.address?.city || "",
            category: hotel.category || "Standard",
            type: "hotel",
            checkins,
            checkouts,
            totalGuests,
            numberOfRooms: hotel.numberOfRooms || 0,
            ownerName: hotel.ownerName || "",
            phone: hotel.phone || "",
          };
        } catch (hotelError) {
          console.error(`Error processing hotel ${hotel.name}:`, hotelError);
          return {
            id: hotel._id.toString(),
            name: hotel.name,
            address: hotel.address?.street || hotel.address || "",
            city: hotel.address?.city || "",
            category: hotel.category || "Standard",
            type: "hotel",
            checkins: 0,
            checkouts: 0,
            totalGuests: 0,
            error: "Failed to calculate stats",
          };
        }
      })
    );

    // Log report generation activity
    await logActivity(
      req.user.policeId.toString(),
      "report_generated",
      "report",
      `hotels_stats_${Date.now()}`,
      {
        reportType: "hotels_stats",
        period,
        city: city || "all",
        category: category || "all",
        hotelCount: hotels.length,
        totalRecords: hotelStats.length,
      },
      req
    );

    res.json({
      success: true,
      data: hotelStats,
      metadata: {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in getAllHotelsStats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching hotel statistics",
      error: error.message,
    });
  }
};

// FIXED: getHotelGuests with activity logging
const getHotelGuests = async (req, res) => {
  try {
    console.log("getHotelGuests called for hotel:", req.params.hotelId);
    const { hotelId } = req.params;
    const {
      period = "all",
      status = "all",
      page = 1,
      limit = 50,
      search = "",
    } = req.query;

    if (!hotelId) {
      return res.status(400).json({
        success: false,
        message: "Hotel ID is required",
      });
    }

    // Verify hotel exists
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Build query
    const query = { hotelId };

    // Add date filtering only if period is not "all"
    if (period !== "all") {
      const startDate = getStartOfPeriod(period);
      const endDate = new Date();
      query.$or = [
        { checkInTime: { $gte: startDate, $lte: endDate } },
        { checkInDate: { $gte: startDate, $lte: endDate } },
      ];
    }

    // Add status filtering
    if (status !== "all") {
      query.status = status;
    }

    // Add search functionality
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { roomNumber: { $regex: search, $options: "i" } },
          { nationality: { $regex: search, $options: "i" } },
        ],
      });
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const limitNum = parseInt(limit);

    // Get guests and total count
    const [guests, totalCount, totalGuestsSum] = await Promise.all([
      Guest.find(query)
        .select(
          "name phone checkInTime checkOutDate status roomNumber nationality purpose guestCount totalAmount"
        )
        .sort({ checkInTime: -1 })
        .skip(skip)
        .limit(limitNum),
      Guest.countDocuments(query),
      // Sum of actual guests
      Guest.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalActualGuests: { $sum: { $ifNull: ["$guestCount", 1] } },
          },
        },
      ]),
    ]);

    const totalActualGuests = totalGuestsSum[0]?.totalActualGuests || 0;

    console.log("Found guests:", {
      guestRecords: guests.length,
      totalRecords: totalCount,
      totalActualGuests,
    });

    // Log report viewing activity
    await logActivity(
      req.user.policeId.toString(),
      "report_viewed",
      "report",
      `hotel_guests_${hotelId}`,
      {
        reportType: "hotel_guests",
        hotelId,
        hotelName: hotel.name,
        period,
        status,
        search: search || null,
        totalRecords: totalCount,
        totalActualGuests,
        page: parseInt(page),
      },
      req
    );

    res.json({
      success: true,
      data: guests,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        totalActualGuests,
        limit: limitNum,
        hasNext: skip + guests.length < totalCount,
        hasPrev: page > 1,
      },
      hotel: {
        id: hotel._id,
        name: hotel.name,
        address: hotel.address,
      },
      filters: {
        period,
        status,
        search,
      },
    });
  } catch (error) {
    console.error("Error in getHotelGuests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get guests",
      error: error.message,
    });
  }
};

// Additional report functions with activity logging
const generateCustomReport = async (req, res) => {
  try {
    const { reportType, dateRange, filters, format = "json" } = req.body;

    // Validate required fields
    if (!reportType) {
      return res.status(400).json({
        success: false,
        error: "Report type is required",
      });
    }

    let reportData = {};
    let reportId = `custom_${reportType}_${Date.now()}`;

    // Generate different types of reports
    switch (reportType) {
      case "occupancy_report":
        reportData = await generateOccupancyReport(dateRange, filters);
        break;
      case "revenue_report":
        reportData = await generateRevenueReport(dateRange, filters);
        break;
      case "guest_analytics":
        reportData = await generateGuestAnalytics(dateRange, filters);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid report type",
        });
    }

    const report = {
      id: reportId,
      type: reportType,
      generatedAt: new Date(),
      generatedBy: req.user.name,
      dateRange,
      filters,
      data: reportData,
      format,
    };

    // Log custom report generation
    await logActivity(
      req.user.policeId.toString(),
      "report_generated",
      "report",
      reportId,
      {
        reportType: "custom_report",
        subtype: reportType,
        dateRange,
        filters: filters || {},
        recordCount: Array.isArray(reportData) ? reportData.length : 1,
        format,
      },
      req
    );

    res.json({
      success: true,
      message: "Custom report generated successfully",
      report,
    });
  } catch (error) {
    console.error("Generate custom report error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate custom report",
      message: error.message,
    });
  }
};

// Helper functions for custom reports
const generateOccupancyReport = async (dateRange, filters) => {
  // Implementation for occupancy report
  return { message: "Occupancy report data would go here" };
};

const generateRevenueReport = async (dateRange, filters) => {
  // Implementation for revenue report
  return { message: "Revenue report data would go here" };
};

const generateGuestAnalytics = async (dateRange, filters) => {
  // Implementation for guest analytics
  return { message: "Guest analytics data would go here" };
};

module.exports = {
  getAreaWideStats,
  getAllHotelsStats,
  getHotelGuests,
  generateCustomReport,
};
