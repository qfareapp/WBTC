const mongoose = require("mongoose");

const TripOfferSchema = new mongoose.Schema(
  {
    tripInstanceId: { type: mongoose.Schema.Types.ObjectId, ref: "TripInstance", required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true, index: true },
    status: { type: String, enum: ["Pending", "Rejected", "Accepted"], required: true, index: true },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TripOfferSchema.index({ tripInstanceId: 1, driverId: 1 }, { unique: true });

module.exports = mongoose.model("TripOffer", TripOfferSchema);
