const ApiError = require("../utils/ApiError");

module.exports = (err, req, res, next) => {
  const status = err.statusCode || 500;
  const message = err.message || "Something went wrong";

  // mongoose duplicate key
  if (err.code === 11000) {
    return res.status(409).json({ ok: false, message: "Duplicate key", details: err.keyValue });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({ ok: false, message: "Validation error", details: err.errors });
  }

  if (err instanceof ApiError) {
    return res.status(status).json({ ok: false, message });
  }

  return res.status(status).json({ ok: false, message });
};
