const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

module.exports = (validations) => [
  ...validations,
  (req, _res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const first = errors.array({ onlyFirstError: true })[0];
    return next(new ApiError(400, first?.msg || "Invalid request"));
  },
];
