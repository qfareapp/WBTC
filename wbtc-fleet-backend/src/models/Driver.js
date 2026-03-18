const mongoose = require("mongoose");

const DriverSchema = new mongoose.Schema(
  {
    empId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    govtId: { type: String },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    operatorType: { type: String, enum: ["WBTC", "PRIVATE"], default: "WBTC", index: true },
    currentLocation: { type: String, default: null, index: true },
    licenseNumber: { type: String, required: true },
    licenseExpiry: { type: Date, required: true },
    shiftType: { type: String, enum: ["Morning", "Evening", "General"], default: "General" },
    status: { type: String, enum: ["Available", "OnLeave", "Suspended"], default: "Available", index: true },
    phone: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Driver", DriverSchema);
