const jwt = require("jsonwebtoken");
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
  const { empId } = req.body;
  if (!empId) throw new ApiError(400, "empId required");

  const conductor = await Conductor.findOne({ empId });
  if (!conductor) throw new ApiError(401, "Invalid credentials");

  res.json({
    ok: true,
    token: signConductorToken(conductor),
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

