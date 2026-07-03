// scripts/seedJurisdictionData.js
//
// Run from the backend/ folder:
//   node scripts/seedJurisdictionData.js
//
// What this does:
// 1. Finds the ADMIN001 account and sets:
//    - Correct GPS coordinates for Alwal Police Station, Secunderabad
//    - Jurisdiction radius and area name
//    - Updates station name from "HQ" to the real station name
// 2. Creates 12 sub-police officers under that admin.

const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Police = require("../models/Police");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not found in .env — aborting.");
  process.exit(1);
}

// ── Alwal Police Station, Secunderabad ───────────────────────────────────────
// Source: mapcarta.com/N8465529663
// GeoJSON coordinates are always [longitude, latitude] — NOT [lat, lng]
const ALWAL_STATION = {
  name: "Alwal Police Station",
  coordinates: [78.51167, 17.50404], // [lng, lat]
  radiusKm: 8, // 8km covers Alwal, Lothkunta, Dammaiguda, Kompally area
  areaName: "Alwal Jurisdiction Zone",
};

const ADMIN_BADGE = "ADMIN001";
const DEFAULT_PASSWORD = "Police@123"; // all seeded sub-police share this

// 12 sub-police officers stationed at Alwal
const SUB_OFFICERS = [
  {
    badge: "SUB001",
    name: "Ravi Teja Yadav",
    rank: "Sub-Inspector",
    email: "ravi.teja@alwalpolice.gov.in",
    phone: "9000000001",
  },
  {
    badge: "SUB002",
    name: "Priya Sharma",
    rank: "Head Constable",
    email: "priya.sharma@alwalpolice.gov.in",
    phone: "9000000002",
  },
  {
    badge: "SUB003",
    name: "Arjun Reddy",
    rank: "Constable",
    email: "arjun.reddy@alwalpolice.gov.in",
    phone: "9000000003",
  },
  {
    badge: "SUB004",
    name: "Lakshmi Devi",
    rank: "Sub-Inspector",
    email: "lakshmi.devi@alwalpolice.gov.in",
    phone: "9000000004",
  },
  {
    badge: "SUB005",
    name: "Kiran Kumar Naidu",
    rank: "Constable",
    email: "kiran.kumar@alwalpolice.gov.in",
    phone: "9000000005",
  },
  {
    badge: "SUB006",
    name: "Sneha Rao",
    rank: "Head Constable",
    email: "sneha.rao@alwalpolice.gov.in",
    phone: "9000000006",
  },
  {
    badge: "SUB007",
    name: "Vikram Singh",
    rank: "Sub-Inspector",
    email: "vikram.singh@alwalpolice.gov.in",
    phone: "9000000007",
  },
  {
    badge: "SUB008",
    name: "Anjali Nair",
    rank: "Constable",
    email: "anjali.nair@alwalpolice.gov.in",
    phone: "9000000008",
  },
  {
    badge: "SUB009",
    name: "Suresh Babu Goud",
    rank: "Head Constable",
    email: "suresh.babu@alwalpolice.gov.in",
    phone: "9000000009",
  },
  {
    badge: "SUB010",
    name: "Deepa Iyer",
    rank: "Sub-Inspector",
    email: "deepa.iyer@alwalpolice.gov.in",
    phone: "9000000010",
  },
  {
    badge: "SUB011",
    name: "Manoj Verma",
    rank: "Constable",
    email: "manoj.verma@alwalpolice.gov.in",
    phone: "9000000011",
  },
  {
    badge: "SUB012",
    name: "Pooja Patel",
    rank: "Sub-Inspector",
    email: "pooja.patel@alwalpolice.gov.in",
    phone: "9000000012",
  },
];

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB Atlas\n");

  // ── 1. Update the admin ─────────────────────────────────────────────
  const admin = await Police.findOne({ badgeNumber: ADMIN_BADGE });

  if (!admin) {
    console.error(
      `Admin with badge "${ADMIN_BADGE}" not found. Check your DB.`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  admin.station = ALWAL_STATION.name; // fix "HQ" → real station
  admin.jurisdiction = {
    center: {
      type: "Point",
      coordinates: ALWAL_STATION.coordinates,
    },
    radiusKm: ALWAL_STATION.radiusKm,
    areaName: ALWAL_STATION.areaName,
  };

  await admin.save();

  console.log("Admin updated successfully:");
  console.log(`  Name:          ${admin.name}  (${admin.badgeNumber})`);
  console.log(`  Station:       ${admin.station}`);
  console.log(`  Jurisdiction:  ${ALWAL_STATION.areaName}`);
  console.log(`  Center (lng):  ${ALWAL_STATION.coordinates[0]}`);
  console.log(`  Center (lat):  ${ALWAL_STATION.coordinates[1]}`);
  console.log(`  Radius:        ${ALWAL_STATION.radiusKm} km\n`);

  // ── 2. Hash the shared default password ────────────────────────────
  const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // ── 3. Upsert 12 sub-police officers ───────────────────────────────
  let created = 0,
    updated = 0;

  for (const o of SUB_OFFICERS) {
    const existing = await Police.findOne({
      $or: [{ email: o.email }, { badgeNumber: o.badge }],
    });

    if (existing) {
      existing.managedBy = admin._id;
      existing.station = ALWAL_STATION.name;
      existing.name = o.name;
      existing.rank = o.rank;
      existing.contactNumber = o.phone;
      await existing.save();
      updated++;
      console.log(`  Updated: ${o.name}  (${o.badge})`);
    } else {
      await Police.create({
        badgeNumber: o.badge,
        name: o.name,
        email: o.email,
        password: hashed,
        station: ALWAL_STATION.name,
        rank: o.rank,
        role: "sub_police",
        managedBy: admin._id,
        contactNumber: o.phone,
        department: "General",
        isActive: true,
      });
      created++;
      console.log(`  Created: ${o.name}  (${o.badge})`);
    }
  }

  console.log(`\nSub-police: ${created} created, ${updated} updated.`);
  console.log(`Shared password for all seeded officers: ${DEFAULT_PASSWORD}\n`);

  console.log("Quick-login test accounts:");
  SUB_OFFICERS.slice(0, 3).forEach((o) => {
    console.log(`  ${o.name.padEnd(22)} → ${o.email} / ${DEFAULT_PASSWORD}`);
  });
  console.log("  ... and 9 more (SUB004–SUB012)\n");

  await mongoose.disconnect();
  console.log("Disconnected. Seeding complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
