require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const BusCrewMapping = require("../models/BusCrewMapping");

async function run() {
  await connectDB();

  const collection = BusCrewMapping.collection;
  const indexes = await collection.indexes();

  const legacy = indexes.find(
    (idx) =>
      idx.key &&
      idx.key.busId === 1 &&
      idx.key.driverId === 1 &&
      idx.key.conductorId === 1 &&
      idx.key.isActive === 1
  );

  if (legacy) {
    await collection.dropIndex(legacy.name);
    console.log(`Dropped legacy index: ${legacy.name}`);
  } else {
    console.log("Legacy index not found (already removed).");
  }

  await collection.createIndex(
    { busId: 1, driverId: 1, conductorId: 1 },
    {
      unique: true,
      partialFilterExpression: { isActive: true },
      name: "uniq_active_bus_driver_conductor",
    }
  );
  console.log("Created/ensured partial unique index: uniq_active_bus_driver_conductor");

  const updated = await collection.indexes();
  console.log(
    "Current indexes:",
    updated.map((idx) => idx.name).join(", ")
  );
}

run()
  .catch((error) => {
    console.error("Index migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors
    }
  });
