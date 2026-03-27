const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return next(new ApiError(401, "Missing token"));

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== "PASSENGER") return next(new ApiError(403, "Forbidden"));
    req.passenger = payload; // { passengerId, role }
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired token"));
  }
};
