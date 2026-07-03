// jobs/autoCheckout.js
//
// Runs every hour and automatically checks out guests whose checkOutDate
// has passed but whose status is still "checked-in", "reported", or "flagged".
//
// Mirrors what checkOutGuest() does manually:
//   1. status = "checked-out"
//   2. checkOutDate stays as-is (it's already the planned date — no overwrite)
//   3. logActivity with action: "check_out" and autoCheckout: true
//
// Install:  npm install node-cron  (in backend/)
// Start:    require("./jobs/autoCheckout")  in server.js

const cron = require("node-cron");
const Guest = require("../models/Guest");
const Hotel = require("../models/Hotel");
const { logActivity } = require("../controllers/activityController");

// Statuses that should be auto-checked-out when past checkout date.
// "checked-out" is excluded (already done).
// "flagged" is intentionally included — a flagged guest whose stay has
// ended should still be marked checked-out in the records; the flag
// and flagReason remain in place so the police record is intact.
const AUTO_CHECKOUT_STATUSES = ["checked-in", "reported", "flagged"];

const runAutoCheckout = async () => {
  const startTime = Date.now();
  const now = new Date();

  console.log(`\n[AutoCheckout] Starting job at ${now.toISOString()}`);

  try {
    // Find all guests whose planned checkout date has passed
    // but who are still in an active status
    const overdueGuests = await Guest.find({
      status: { $in: AUTO_CHECKOUT_STATUSES },
      checkOutDate: { $lt: now, $ne: null },
    }).select("_id name roomNumber hotelId status checkOutDate totalAmount");

    if (overdueGuests.length === 0) {
      console.log("[AutoCheckout] No overdue guests found — nothing to do.");
      return;
    }

    console.log(
      `[AutoCheckout] Found ${overdueGuests.length} overdue guest(s). Processing...`,
    );

    let successCount = 0;
    let errorCount = 0;

    for (const guest of overdueGuests) {
      try {
        const previousStatus = guest.status;

        // Mirror manual checkout — only the status field changes.
        // checkOutDate is NOT overwritten: it already holds the planned date,
        // which IS the checkout date for auto-checkouts.
        await Guest.updateOne(
          { _id: guest._id },
          { $set: { status: "checked-out" } },
        );

        // Fetch hotel name for the activity log (same as manual checkout does)
        const hotel = await Hotel.findById(guest.hotelId).select("name").lean();

        // Log the auto-checkout in the activity trail — same event name as
        // manual checkout ("guest_checked") so it appears correctly in the
        // hotel's existing activity monitoring UI, with autoCheckout:true
        // so it can be distinguished from a manual checkout if needed.
        await logActivity(
          "system", // performedBy — no human user triggered this
          "guest_checked", // same action as manual checkout
          "guest",
          guest._id,
          {
            guestName: guest.name,
            roomNumber: guest.roomNumber,
            hotelName: hotel?.name || "Unknown",
            checkOutDate: guest.checkOutDate,
            finalAmount: guest.totalAmount,
            previousStatus,
            action: "check_out",
            autoCheckout: true, // distinguishes from manual in logs
            triggeredAt: now.toISOString(),
          },
          null, // no req object for system-triggered events
        );

        successCount++;
        console.log(
          `[AutoCheckout] ✅ Checked out: ${guest.name} | Room ${guest.roomNumber} | ` +
            `Was: ${previousStatus} | CheckOutDate: ${guest.checkOutDate.toISOString()}`,
        );
      } catch (guestError) {
        errorCount++;
        console.error(
          `[AutoCheckout] ❌ Failed for guest ${guest._id} (${guest.name}):`,
          guestError.message,
        );
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[AutoCheckout] Done in ${elapsed}ms — ` +
        `✅ ${successCount} checked out, ❌ ${errorCount} failed.\n`,
    );
  } catch (err) {
    console.error(
      "[AutoCheckout] Job failed with unexpected error:",
      err.message,
    );
  }
};

// Schedule: runs at the top of every hour ("0 * * * *")
// Change to "*/30 * * * *" for every 30 minutes,
// or  "*/5 * * * *"  for every 5 minutes during testing.
const startAutoCheckoutJob = () => {
  console.log("[AutoCheckout] Scheduling job — runs every hour on the hour.");

  cron.schedule("0 * * * *", runAutoCheckout, {
    scheduled: true,
    timezone: "Asia/Kolkata", // IST — checkout dates are in IST context
  });

  // Also run once immediately on server start so any guests that became
  // overdue while the server was offline are caught right away.
  runAutoCheckout();
};

module.exports = { startAutoCheckoutJob, runAutoCheckout };
