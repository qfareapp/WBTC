require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const BusCrewMapping = require("../models/BusCrewMapping");

async function run() {
  const now = new Date();
  await connectDB();

  const filter = {
    isActive: true,
    activeTo: { $ne: null, $lt: now },
  };

  const beforeCount = await BusCrewMapping.countDocuments(filter);
  const result = await BusCrewMapping.updateMany(filter, { $set: { isActive: false } });
  const afterCount = await BusCrewMapping.countDocuments(filter);

  console.log("Cleanup complete.");
  console.log(`Matched: ${result.matchedCount ?? 0}`);
  console.log(`Modified: ${result.modifiedCount ?? 0}`);
  console.log(`Remaining expired-active rows: ${afterCount}`);
  console.log(`Before count: ${beforeCount}`);
}

run()
  .catch((error) => {
    console.error("Cleanup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors
    }
  });
