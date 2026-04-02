const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Police = require("../models/Police");
require("dotenv").config();

const testOfficers = [
  {
    badgeNumber: "ADM001",
    name: "Admin Officer",
    email: "admin@police.gov.in",
    password: "admin123",
    station: "Central Police Station",
    rank: "Administrator",
  },
  {
    badgeNumber: "OFF001",
    name: "Police Officer",
    email: "officer@police.gov.in",
    password: "police123",
    station: "District Police Station",
    rank: "Police Officer",
  },
  {
    badgeNumber: "INS001",
    name: "Inspector",
    email: "inspector@police.gov.in",
    password: "inspect123",
    station: "City Police Station",
    rank: "Inspector",
  },
];

async function createTestPolice() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/safecheckin"
    );

    console.log("Connected to MongoDB");

    for (const officer of testOfficers) {
      // Check if officer already exists
      const existing = await Police.findOne({ email: officer.email });
      if (existing) {
        console.log(`Officer ${officer.email} already exists`);
        continue;
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(officer.password, salt);

      // Create officer
      const newOfficer = new Police({
        ...officer,
        password: hashedPassword,
      });

      await newOfficer.save();
      console.log(`Created officer: ${officer.email}`);
    }

    console.log("Test police officers created successfully");
  } catch (error) {
    console.error("Error creating test police officers:", error);
  } finally {
    await mongoose.disconnect();
  }
}

createTestPolice();
