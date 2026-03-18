const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

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

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, username, passwordHash, role, depotId: depotId || null });

  res.status(201).json({ ok: true, user: { id: user._id, name: user.name, role: user.role }, token: signToken(user) });
});

exports.login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username, active: true });
  if (!user) throw new ApiError(401, "Invalid credentials");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new ApiError(401, "Invalid credentials");

  res.json({ ok: true, token: signToken(user), user: { id: user._id, name: user.name, role: user.role, depotId: user.depotId } });
});
