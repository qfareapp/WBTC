const mongoose = require("mongoose");

const ConductorSchema = new mongoose.Schema(
  {
    empId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    operatorType: { type: String, enum: ["WBTC", "PRIVATE"], default: "WBTC", index: true },
    currentLocation: { type: String, default: null, index: true },
    shiftType: { type: String, enum: ["Morning", "Evening", "General"], default: "General" },
    status: { type: String, enum: ["Available", "OnLeave", "Suspended"], default: "Available", index: true },
    phone: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conductor", ConductorSchema);
