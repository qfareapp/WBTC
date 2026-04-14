const mongoose = require("mongoose");

const RouteStopSchema = new mongoose.Schema(
  {
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    index: { type: Number, required: true },
    name: { type: String, required: true },
    stopMasterId: { type: mongoose.Schema.Types.ObjectId, ref: "StopMaster", default: null, index: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    landmarkImageUrl: { type: String, default: null },
    upTowards: { type: String, default: null },
    downTowards: { type: String, default: null },
    upBoardingPointId: { type: mongoose.Schema.Types.ObjectId, ref: "StopBoardingPoint", default: null },
    downBoardingPointId: { type: mongoose.Schema.Types.ObjectId, ref: "StopBoardingPoint", default: null },
    upLatitude: { type: Number, default: null },
    upLongitude: { type: Number, default: null },
    upLandmarkImageUrl: { type: String, default: null },
    downLatitude: { type: Number, default: null },
    downLongitude: { type: Number, default: null },
    downLandmarkImageUrl: { type: String, default: null },
  },
  { timestamps: true }
);

RouteStopSchema.index({ routeId: 1, index: 1 }, { unique: true });

module.exports = mongoose.model("RouteStop", RouteStopSchema);
