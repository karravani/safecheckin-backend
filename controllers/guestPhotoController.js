// controllers/guestPhotoController.js
// Public endpoint — sits BEFORE router.use(auth) in guestRoutes.js
// Serves guest photos stored as base64 in MongoDB OR legacy disk paths.

const Guest = require("../models/Guest");
const path = require("path");
const fs = require("fs");

const ALLOWED_TYPES = ["guestPhoto", "idFront", "idBack"];

exports.serveGuestPhoto = async (req, res) => {
  const { guestId, photoType } = req.params;

  if (!ALLOWED_TYPES.includes(photoType)) {
    return res.status(400).json({ error: "Invalid photo type" });
  }

  try {
    const guest = await Guest.findById(guestId).select(
      `photos.${photoType} hotelId`,
    );

    if (!guest) {
      console.log(`[photo] guest not found: ${guestId}`);
      return res.status(404).json({ error: "Guest not found" });
    }

    const photo = guest.photos?.[photoType];

    console.log(`[photo] ${guestId}/${photoType}:`, {
      hasData: !!photo?.data,
      dataLength: photo?.data?.length ?? 0,
      hasPath: !!photo?.path,
      path: photo?.path ?? null,
      filename: photo?.filename ?? null,
      mimeType: photo?.mimeType ?? null,
    });

    if (!photo) {
      return res
        .status(404)
        .json({ error: "Photo field not set for this guest" });
    }

    // ── Base64 path (new uploads via memoryStorage) ───────────────────
    if (photo.data) {
      const mimeType = photo.mimeType || "image/jpeg";
      const buffer = Buffer.from(photo.data, "base64");

      res.set({
        "Content-Type": mimeType,
        "Content-Length": buffer.length,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": `inline; filename="${photo.filename || photoType}"`,
      });
      return res.send(buffer);
    }

    // ── Legacy disk path (guests uploaded before base64 migration) ────
    if (photo.path) {
      // photo.path might be absolute or relative — normalise it
      let filePath = photo.path;
      if (!path.isAbsolute(filePath)) {
        filePath = path.join(__dirname, "..", filePath);
      }

      console.log(`[photo] legacy disk path resolved to: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        console.log(`[photo] file not on disk: ${filePath}`);
        return res.status(404).json({
          error:
            "Photo was stored on disk but the file no longer exists. " +
            "Re-upload the guest's photos to store them in MongoDB.",
        });
      }

      const ext = path.extname(photo.filename || filePath).toLowerCase();
      const mime = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
      };

      res.set({
        "Content-Type": mime[ext] || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      });
      return res.sendFile(filePath);
    }

    // ── filename only (some older records only stored the filename) ────
    if (photo.filename) {
      // Try common upload directories
      const candidates = [
        path.join(__dirname, "..", "uploads", photo.filename),
        path.join(__dirname, "..", "uploads", "guest-photos", photo.filename),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          const ext = path.extname(photo.filename).toLowerCase();
          const mime = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
          };
          res.set({
            "Content-Type": mime[ext] || "image/jpeg",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          });
          return res.sendFile(candidate);
        }
      }

      console.log(
        `[photo] filename-only record, file not found: ${photo.filename}`,
      );
    }

    return res.status(404).json({
      error:
        "No photo data available. The photo may have been stored on a " +
        "previous server deployment. Please re-upload.",
    });
  } catch (err) {
    console.error("[photo] serveGuestPhoto error:", err);
    return res.status(500).json({ error: "Failed to retrieve photo" });
  }
};
