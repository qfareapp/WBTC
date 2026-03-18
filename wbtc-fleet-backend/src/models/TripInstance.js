const mongoose = require("mongoose");

const TripInstanceSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus", required: true, index: true },
    direction: { type: String, enum: ["UP", "DOWN"], required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    actualStartTime: { type: Date, default: null },
    actualEndTime: { type: Date, default: null },
    actualDurationMin: { type: Number, default: null },
    openingKm: { type: Number, default: null },
    closingKm: { type: Number, default: null },
    releasedForReuse: { type: Boolean, default: false, index: true },
    lastLatitude: { type: Number, default: null },
    lastLongitude: { type: Number, default: null },
    lastLocationAt: { type: Date, default: null },
    status: { type: String, enum: ["Scheduled", "Active", "Completed", "Cancelled"], default: "Scheduled", index: true },
  },
  { timestamps: true }
);

TripInstanceSchema.index({ date: 1, routeId: 1, direction: 1, startTime: 1 }, { unique: true });

module.exports = mongoose.model("TripInstance", TripInstanceSchema);
