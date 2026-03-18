const mongoose = require("mongoose");

const BusCrewMappingSchema = new mongoose.Schema(
  {
    busId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus", required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true, index: true },
    conductorId: { type: mongoose.Schema.Types.ObjectId, ref: "Conductor", required: true, index: true },
    activeFrom: { type: Date, default: Date.now, index: true },
    activeTo: { type: Date, default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

BusCrewMappingSchema.index(
  { busId: 1, driverId: 1, conductorId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: "uniq_active_bus_driver_conductor",
  }
);

module.exports = mongoose.model("BusCrewMapping", BusCrewMappingSchema);
