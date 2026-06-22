const router = require("express").Router();
const { body } = require("express-validator");
const passengerAuth = require("../middleware/passengerAuth");
const { createRateLimit, getClientIp } = require("../middleware/rateLimit");
const validate = require("../middleware/validate");
const {
  sendOtp,
  verifyOtp,
  completeProfile,
  getProfile,
} = require("../controllers/passengerAuth.controller");

const otpSendRateLimit = createRateLimit({
  name: "passenger-auth-send-otp",
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: req => `${getClientIp(req)}:${String(req.body?.email || "").toLowerCase().trim() || "unknown"}`,
  message: "Too many OTP requests. Please wait before trying again.",
});

const otpVerifyRateLimit = createRateLimit({
  name: "passenger-auth-verify-otp",
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: req => `${getClientIp(req)}:${String(req.body?.email || "").toLowerCase().trim() || "unknown"}`,
  message: "Too many OTP verification attempts. Please wait before trying again.",
});

const emailValidation = body("email")
  .isEmail()
  .withMessage("Valid email is required")
  .normalizeEmail();

const otpValidation = body("otp")
  .trim()
  .matches(/^\d{6}$/)
  .withMessage("OTP must be a 6-digit code");

// Public
router.post("/send-otp", otpSendRateLimit, validate([emailValidation]), sendOtp);
router.post("/verify-otp", otpVerifyRateLimit, validate([emailValidation, otpValidation]), verifyOtp);

// Protected (requires valid passenger JWT)
router.post("/complete-profile", passengerAuth, completeProfile);
router.get("/me", passengerAuth, getProfile);

module.exports = router;
