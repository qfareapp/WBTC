const mongoose = require("mongoose");

const RouteStopSchema = new mongoose.Schema(
  {
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    index: { type: Number, required: true },
    name: { type: String, required: true },
  },
  { timestamps: true }
);

RouteStopSchema.index({ routeId: 1, index: 1 }, { unique: true });

module.exports = mongoose.model("RouteStop", RouteStopSchema);
