const mongoose = require("mongoose");

const ConductorOfferSchema = new mongoose.Schema(
  {
    tripInstanceId: { type: mongoose.Schema.Types.ObjectId, ref: "TripInstance", required: true, index: true },
    conductorId: { type: mongoose.Schema.Types.ObjectId, ref: "Conductor", required: true, index: true },
    status: { type: String, enum: ["Rejected", "Accepted"], required: true, index: true },
  },
  { timestamps: true }
);

ConductorOfferSchema.index({ tripInstanceId: 1, conductorId: 1 }, { unique: true });

module.exports = mongoose.model("ConductorOffer", ConductorOfferSchema);

