const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const PassengerUser = require("../models/PassengerUser");
const OtpRecord = require("../models/OtpRecord");
const ApiError = require("../utils/ApiError");

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

const serializePassenger = (passenger) => ({
  id: passenger._id,
  email: passenger.email,
  name: passenger.name,
  phone: passenger.phone,
  address1: passenger.address1,
  address2: passenger.address2,
  profileComplete: passenger.profileComplete,
});

const signPassengerToken = (passenger) =>
  jwt.sign(
    { passengerId: passenger._id, role: "PASSENGER" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );

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

    res.json({
      ok: true,
      token: signPassengerToken(passenger),
      user: serializePassenger(passenger),
    });
  } catch (err) {
    next(err);
  }
};

exports.sendOtp = async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new ApiError(400, "Valid email is required"));
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OtpRecord.updateMany({ email, used: false }, { used: true });
    await OtpRecord.create({ email, otp, expiresAt });

    const transport = getTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM || `"qfare" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your qfare login code",
      text: `Your qfare OTP is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    });

    res.json({ ok: true, message: "OTP sent to your email" });
  } catch (err) {
    next(err);
  }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const otp = String(req.body.otp || "").trim();

    if (!email || !otp) {
      return next(new ApiError(400, "Email and OTP are required"));
    }

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

    record.used = true;
    await record.save();

    let passenger = await PassengerUser.findOne({ email });
    if (!passenger) {
      passenger = await PassengerUser.create({ email });
    }

    res.json({
      ok: true,
      token: signPassengerToken(passenger),
      user: serializePassenger(passenger),
    });
  } catch (err) {
    next(err);
  }
};

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
      user: serializePassenger(passenger),
    });
  } catch (err) {
    next(err);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const passenger = await PassengerUser.findById(req.passenger.passengerId);
    if (!passenger) return next(new ApiError(404, "Passenger not found"));

    res.json({
      ok: true,
      user: serializePassenger(passenger),
    });
  } catch (err) {
    next(err);
  }
};
