const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { hashPassword, comparePassword } = require("../utils/crewPassword");

const signToken = (user) =>
  jwt.sign(
    { userId: user._id, role: user.role, depotId: user.depotId || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

exports.register = asyncHandler(async (req, res) => {
  const { name, username, password, role, depotId } = req.body;

  const exists = await User.findOne({ username });
  if (exists) throw new ApiError(409, "Username already exists");

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    name,
    username,
    passwordHash,
    role,
    depotId: depotId || null,
    mustChangePassword: false,
    passwordUpdatedAt: new Date(),
  });

  res.status(201).json({
    ok: true,
    user: { id: user._id, name: user.name, username: user.username, role: user.role },
    token: signToken(user),
    mustChangePassword: Boolean(user.mustChangePassword),
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username, active: true });
  if (!user) throw new ApiError(401, "Invalid credentials");

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) throw new ApiError(401, "Invalid credentials");

  res.json({
    ok: true,
    token: signToken(user),
    mustChangePassword: Boolean(user.mustChangePassword),
    user: {
      id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      depotId: user.depotId,
    },
  });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) throw new ApiError(400, "currentPassword and newPassword required");
  if (String(newPassword).trim().length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters");
  }

  const user = await User.findById(req.user.userId);
  if (!user || !user.active) throw new ApiError(404, "User not found");

  const ok = await comparePassword(String(currentPassword), user.passwordHash);
  if (!ok) throw new ApiError(401, "Current password is incorrect");

  user.passwordHash = await hashPassword(String(newPassword).trim());
  user.mustChangePassword = false;
  user.passwordUpdatedAt = new Date();
  await user.save();

  res.json({ ok: true, message: "Password updated successfully" });
});
