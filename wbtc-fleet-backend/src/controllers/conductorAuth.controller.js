const jwt = require("jsonwebtoken");
const { comparePassword, hashPassword } = require("../utils/crewPassword");
const Conductor = require("../models/Conductor");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const signConductorToken = (conductor) =>
  jwt.sign(
    { userId: conductor._id, role: "CONDUCTOR", depotId: conductor.depotId || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

exports.loginConductor = asyncHandler(async (req, res) => {
  const { empId, password } = req.body;
  if (!empId) throw new ApiError(400, "empId required");
  if (!password) throw new ApiError(400, "password required");

  const conductor = await Conductor.findOne({ empId }).select("+passwordHash mustChangePassword");
  if (!conductor) throw new ApiError(401, "Invalid credentials");
  const passwordOk = await comparePassword(password, conductor.passwordHash);
  if (!passwordOk) throw new ApiError(401, "Invalid credentials");

  res.json({
    ok: true,
    token: signConductorToken(conductor),
    mustChangePassword: Boolean(conductor.mustChangePassword),
    conductor: {
      id: conductor._id,
      name: conductor.name,
      empId: conductor.empId,
      depotId: conductor.depotId,
      status: conductor.status,
      currentLocation: conductor.currentLocation || null,
    },
  });
});

exports.changeConductorPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword) throw new ApiError(400, "currentPassword required");
  if (!newPassword) throw new ApiError(400, "newPassword required");
  if (String(newPassword).trim().length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters");
  }

  const conductor = await Conductor.findById(req.user.userId).select("+passwordHash mustChangePassword");
  if (!conductor) throw new ApiError(404, "Conductor not found");

  const ok = await comparePassword(currentPassword, conductor.passwordHash);
  if (!ok) throw new ApiError(401, "Current password is incorrect");

  conductor.passwordHash = await hashPassword(String(newPassword).trim());
  conductor.mustChangePassword = false;
  conductor.passwordUpdatedAt = new Date();
  await conductor.save();

  res.json({ ok: true, message: "Password updated successfully" });
});
