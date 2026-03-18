const mongoose = require("mongoose");

const BusSchema = new mongoose.Schema(
  {
    busNumber: { type: String, required: true, unique: true, index: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    attachedRouteId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", default: null, index: true },
    currentLocation: { type: String, default: null, index: true },
    busType: { type: String, default: "Non-AC" },
    seatingCapacity: { type: Number, default: 0 },
    fuelType: { type: String, enum: ["Diesel", "CNG", "Electric"], default: "Diesel" },
    operatorType: { type: String, enum: ["WBTC", "PRIVATE"], default: "WBTC", index: true },
    crewPolicy: { type: String, enum: ["FLEXIBLE", "FIXED"], default: "FLEXIBLE", index: true },
    status: { type: String, enum: ["Active", "Breakdown", "UnderMaintenance"], default: "Active", index: true },
    lastServiceDate: { type: Date, default: null },
    lastOdometerKm: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bus", BusSchema);
