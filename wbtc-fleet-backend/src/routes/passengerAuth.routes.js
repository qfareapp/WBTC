const router = require("express").Router();
const passengerAuth = require("../middleware/passengerAuth");
const {
  directLogin,
  sendOtp,
  verifyOtp,
  completeProfile,
  getProfile,
} = require("../controllers/passengerAuth.controller");

// Public
router.post("/login", directLogin);   // temporary: email-only, no OTP
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

// Protected (requires valid passenger JWT)
router.post("/complete-profile", passengerAuth, completeProfile);
router.get("/me", passengerAuth, getProfile);

module.exports = router;
