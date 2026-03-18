const mongoose = require("mongoose");

const RouteSchema = new mongoose.Schema(
  {
    routeCode: { type: String, required: true, index: true },
    routeName: { type: String, required: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    operatorType: { type: String, enum: ["WBTC", "PRIVATE"], default: "WBTC", index: true },
    source: { type: String, required: true },
    destination: { type: String, required: true },
    distanceKm: { type: Number, default: 0 },
    standardTripTimeMin: { type: Number, default: 0 },
    frequencyMin: { type: Number, default: 0 },
    firstTripTimeUp: { type: String },
    firstTripTimeDown: { type: String },
    lastTripTime: { type: String },
    assignmentMode: { type: String, enum: ["MANUAL", "AUTO"], default: "MANUAL", index: true },
    operational: { type: Boolean, default: true },
  },
  { timestamps: true }
);

RouteSchema.index({ routeCode: 1, operatorType: 1 }, { unique: true, name: "uniq_route_code_operator" });

module.exports = mongoose.model("Route", RouteSchema);
