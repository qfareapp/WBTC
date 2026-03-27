const mongoose = require("mongoose");

const OtpRecordSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
}, { timestamps: true });

// Auto-delete expired records after 10 minutes
OtpRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model("OtpRecord", OtpRecordSchema);
