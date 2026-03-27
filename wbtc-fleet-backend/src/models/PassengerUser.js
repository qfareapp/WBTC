const mongoose = require("mongoose");

const PassengerUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, default: null },
    phone: { type: String, default: null },
    address1: { type: String, default: null },
    address2: { type: String, default: null },
    profileComplete: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PassengerUser", PassengerUserSchema);
