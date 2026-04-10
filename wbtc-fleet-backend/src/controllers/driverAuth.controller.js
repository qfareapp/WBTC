const jwt = require("jsonwebtoken");
const { comparePassword, hashPassword } = require("../utils/crewPassword");
const Driver = require("../models/Driver");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const buildDriverProfile = (driver) => ({
  id: driver._id,
  name: driver.name,
  empId: driver.empId,
  depotId: driver.depotId,
  status: driver.status,
  currentLocation: driver.currentLocation || null,
});

const signDriverToken = (driver) =>
  jwt.sign(
    { userId: driver._id, role: "DRIVER", depotId: driver.depotId || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

exports.loginDriver = asyncHandler(async (req, res) => {
  const { empId, password } = req.body;
  if (!empId) throw new ApiError(400, "empId required");
  if (!password) throw new ApiError(400, "password required");

  const driver = await Driver.findOne({ empId }).select("+passwordHash mustChangePassword");
  if (!driver) throw new ApiError(401, "Invalid credentials");
  const passwordOk = await comparePassword(password, driver.passwordHash);
  if (!passwordOk) throw new ApiError(401, "Invalid credentials");

  res.json({
    ok: true,
    token: signDriverToken(driver),
    mustChangePassword: Boolean(driver.mustChangePassword),
    driver: buildDriverProfile(driver),
  });
});

exports.getDriverProfile = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.user.userId).populate("depotId", "depotName depotCode");
  if (!driver) throw new ApiError(404, "Driver not found");

  res.json({
    ok: true,
    driver: buildDriverProfile(driver),
  });
});

exports.changeDriverPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword) throw new ApiError(400, "currentPassword required");
  if (!newPassword) throw new ApiError(400, "newPassword required");
  if (String(newPassword).trim().length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters");
  }

  const driver = await Driver.findById(req.user.userId).select("+passwordHash mustChangePassword");
  if (!driver) throw new ApiError(404, "Driver not found");

  const ok = await comparePassword(currentPassword, driver.passwordHash);
  if (!ok) throw new ApiError(401, "Current password is incorrect");

  driver.passwordHash = await hashPassword(String(newPassword).trim());
  driver.mustChangePassword = false;
  driver.passwordUpdatedAt = new Date();
  await driver.save();

  res.json({ ok: true, message: "Password updated successfully" });
});
