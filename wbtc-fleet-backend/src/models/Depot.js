const mongoose = require("mongoose");

const DepotSchema = new mongoose.Schema(
  {
    depotCode: { type: String, required: true, unique: true, index: true },
    depotName: { type: String, required: true },
    location: { type: String },
    address: { type: String },
    contactPerson: { type: String },
    contactNumber: { type: String },
    operatorType: { type: String, enum: ["WBTC", "PRIVATE"], default: "WBTC", index: true },
    capacity: { type: Number, default: 0 },
    operational: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Depot", DepotSchema);
