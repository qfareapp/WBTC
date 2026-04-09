const mongoose = require("mongoose");
const Driver = require("../models/Driver");
const Conductor = require("../models/Conductor");
const { DEFAULT_CREW_PASSWORD, hashPassword } = require("../utils/crewPassword");

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const defaultHash = await hashPassword(DEFAULT_CREW_PASSWORD);
  const now = new Date();

  const [driverResult, conductorResult] = await Promise.all([
    Driver.updateMany(
      { passwordHash: { $exists: false } },
      {
        $set: {
          passwordHash: defaultHash,
          mustChangePassword: true,
          passwordResetAt: now,
        },
      }
    ),
    Conductor.updateMany(
      { passwordHash: { $exists: false } },
      {
        $set: {
          passwordHash: defaultHash,
          mustChangePassword: true,
          passwordResetAt: now,
        },
      }
    ),
  ]);

  console.log(`Drivers updated: ${driverResult.modifiedCount || 0}`);
  console.log(`Conductors updated: ${conductorResult.modifiedCount || 0}`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
