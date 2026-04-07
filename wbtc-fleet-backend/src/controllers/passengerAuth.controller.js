const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const PassengerUser = require("../models/PassengerUser");
const OtpRecord = require("../models/OtpRecord");
const ApiError = require("../utils/ApiError");

// ---------------------------------------------------------------------------
// Email transport (configured via env vars)
// ---------------------------------------------------------------------------
function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    family: 4,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/passenger-auth/login  (email-only, no OTP — temporary)
// Body: { email }
// ---------------------------------------------------------------------------
exports.directLogin = async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new ApiError(400, "Valid email is required"));
    }

    let passenger = await PassengerUser.findOne({ email });
    if (!passenger) {
      passenger = await PassengerUser.create({ email });
    }

    const token = jwt.sign(
      { passengerId: passenger._id, role: "PASSENGER" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
    );

    res.json({
      ok: true,
      token,
      user: {
        id: passenger._id,
        email: passenger.email,
        name: passenger.name,
        phone: passenger.phone,
        address1: passenger.address1,
        address2: passenger.address2,
        profileComplete: passenger.profileComplete,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/passenger-auth/send-otp
// Body: { email }
// ---------------------------------------------------------------------------
exports.sendOtp = async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new ApiError(400, "Valid email is required"));
    }

    // Generate a 6-digit OTP
    const otp = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate any previous unused OTPs for this email
    await OtpRecord.updateMany({ email, used: false }, { used: true });

    // Save new OTP
    await OtpRecord.create({ email, otp, expiresAt });

    // Send email
    const transport = getTransport();
    await transport.sendMail({
      from: `"qfare" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: "Your qfare login code",
      text: `Your qfare OTP is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px;background:#06111e;border-radius:16px;color:#edf5ff;">
          <div style="font-size:28px;font-weight:900;margin-bottom:8px;">
            <span style="color:#00c896">q</span><span>fare</span>
          </div>
          <p style="color:#a0b4c8;margin-bottom:24px;">Your login verification code</p>
          <div style="background:#0d1f30;border:1px solid #1c3348;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
            <span style="font-size:40px;font-weight:900;letter-spacing:10px;color:#00c896">${otp}</span>
          </div>
          <p style="color:#a0b4c8;font-size:13px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        </div>
      `,
    });

    res.json({ ok: true, message: "OTP sent to your email" });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/passenger-auth/verify-otp
// Body: { email, otp }
// ---------------------------------------------------------------------------
exports.verifyOtp = async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const otp = String(req.body.otp || "").trim();

    if (!email || !otp) {
      return next(new ApiError(400, "Email and OTP are required"));
    }

    // Find the latest unused, unexpired OTP for this email
    const record = await OtpRecord.findOne({
      email,
      used: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!record) {
      return next(new ApiError(400, "OTP expired or not found. Please request a new one."));
    }

    if (record.otp !== otp) {
      return next(new ApiError(400, "Incorrect OTP. Please try again."));
    }

    // Mark OTP as used
    record.used = true;
    await record.save();

    // Find or create passenger
    let passenger = await PassengerUser.findOne({ email });
    if (!passenger) {
      passenger = await PassengerUser.create({ email });
    }

    // Issue JWT
    const token = jwt.sign(
      { passengerId: passenger._id, role: "PASSENGER" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
    );

    res.json({
      ok: true,
      token,
      user: {
        id: passenger._id,
        email: passenger.email,
        name: passenger.name,
        phone: passenger.phone,
        address1: passenger.address1,
        address2: passenger.address2,
        profileComplete: passenger.profileComplete,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/passenger-auth/complete-profile
// Body: { name, phone, address1, address2 }
// Requires: passengerAuth middleware (req.passenger.passengerId)
// ---------------------------------------------------------------------------
exports.completeProfile = async (req, res, next) => {
  try {
    const { name, phone, address1, address2 } = req.body;

    if (!name || !name.trim()) {
      return next(new ApiError(400, "Name is required"));
    }

    const passenger = await PassengerUser.findByIdAndUpdate(
      req.passenger.passengerId,
      {
        name: name.trim(),
        phone: (phone || "").trim() || null,
        address1: (address1 || "").trim() || null,
        address2: (address2 || "").trim() || null,
        profileComplete: true,
      },
      { new: true }
    );

    if (!passenger) return next(new ApiError(404, "Passenger not found"));

    res.json({
      ok: true,
      user: {
        id: passenger._id,
        email: passenger.email,
        name: passenger.name,
        phone: passenger.phone,
        address1: passenger.address1,
        address2: passenger.address2,
        profileComplete: passenger.profileComplete,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/passenger-auth/me
// Requires: passengerAuth middleware
// ---------------------------------------------------------------------------
exports.getProfile = async (req, res, next) => {
  try {
    const passenger = await PassengerUser.findById(req.passenger.passengerId);
    if (!passenger) return next(new ApiError(404, "Passenger not found"));

    res.json({
      ok: true,
      user: {
        id: passenger._id,
        email: passenger.email,
        name: passenger.name,
        phone: passenger.phone,
        address1: passenger.address1,
        address2: passenger.address2,
        profileComplete: passenger.profileComplete,
      },
    });
  } catch (err) {
    next(err);
  }
};
