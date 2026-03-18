const mongoose = require("mongoose");

const RouteDayActivationSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    busIdsUp: [{ type: mongoose.Schema.Types.ObjectId, ref: "Bus" }],
    busIdsDown: [{ type: mongoose.Schema.Types.ObjectId, ref: "Bus" }],
    autoOffersEnabled: { type: Boolean, default: true, index: true },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

RouteDayActivationSchema.index({ date: 1, routeId: 1 }, { unique: true });

module.exports = mongoose.model("RouteDayActivation", RouteDayActivationSchema);
