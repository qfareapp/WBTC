const ApiError = require("../utils/ApiError");

module.exports = (...allowed) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, "Unauthorized"));
  if (!allowed.includes(req.user.role)) return next(new ApiError(403, "Forbidden"));
  next();
};
