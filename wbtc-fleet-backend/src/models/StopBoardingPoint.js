const mongoose = require("mongoose");

const StopBoardingPointSchema = new mongoose.Schema(
  {
    stopMasterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StopMaster",
      required: true,
      index: true,
    },
    towards: { type: String, required: true, trim: true },
    normalizedTowards: { type: String, required: true, trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    landmarkImageUrl: { type: String, default: null },
  },
  { timestamps: true }
);

StopBoardingPointSchema.index({ stopMasterId: 1, normalizedTowards: 1 }, { unique: true });

module.exports = mongoose.model("StopBoardingPoint", StopBoardingPointSchema);
