const mongoose = require("mongoose");

const FareSlabSchema = new mongoose.Schema(
  {
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    fromKm: { type: Number, required: true },
    toKm: { type: Number, required: true },
    fare: { type: Number, required: true },
  },
  { timestamps: true }
);

FareSlabSchema.index({ routeId: 1, fromKm: 1, toKm: 1 }, { unique: true });

module.exports = mongoose.model("FareSlab", FareSlabSchema);
