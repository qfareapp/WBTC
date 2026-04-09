const mongoose = require("mongoose");
const Driver = require("../models/Driver");
const Conductor = require("../models/Conductor");
const { generateTemporaryPassword, hashPassword } = require("../utils/crewPassword");

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const [drivers, conductors] = await Promise.all([
    Driver.find({ passwordHash: { $exists: false } }).select("_id empId name"),
    Conductor.find({ passwordHash: { $exists: false } }).select("_id empId name"),
  ]);

  console.log("Generated temporary passwords:");

  for (const driver of drivers) {
    const temporaryPassword = generateTemporaryPassword();
    driver.passwordHash = await hashPassword(temporaryPassword);
    driver.mustChangePassword = true;
    driver.passwordResetAt = new Date();
    await driver.save();
    console.log(`DRIVER ${driver.empId} ${driver.name} -> ${temporaryPassword}`);
  }

  for (const conductor of conductors) {
    const temporaryPassword = generateTemporaryPassword();
    conductor.passwordHash = await hashPassword(temporaryPassword);
    conductor.mustChangePassword = true;
    conductor.passwordResetAt = new Date();
    await conductor.save();
    console.log(`CONDUCTOR ${conductor.empId} ${conductor.name} -> ${temporaryPassword}`);
  }

  console.log(`Drivers updated: ${drivers.length}`);
  console.log(`Conductors updated: ${conductors.length}`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
