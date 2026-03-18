const jwt = require("jsonwebtoken");
const Driver = require("../models/Driver");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const signDriverToken = (driver) =>
  jwt.sign(
    { userId: driver._id, role: "DRIVER", depotId: driver.depotId || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

exports.loginDriver = asyncHandler(async (req, res) => {
  const { empId } = req.body;
  if (!empId) throw new ApiError(400, "empId required");

  const driver = await Driver.findOne({ empId });
  if (!driver) throw new ApiError(401, "Invalid credentials");

  res.json({
    ok: true,
    token: signDriverToken(driver),
    driver: {
      id: driver._id,
      name: driver.name,
      empId: driver.empId,
      depotId: driver.depotId,
      status: driver.status,
    },
  });
});
