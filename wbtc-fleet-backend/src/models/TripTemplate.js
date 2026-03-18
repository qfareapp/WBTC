const mongoose = require("mongoose");

const TripTemplateSchema = new mongoose.Schema(
  {
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    tripName: { type: String, required: true },        // Morning-1 etc
    startTime: { type: String, required: true },       // "06:30"
    endTime: { type: String, required: true },         // "08:10"
    tripType: { type: String, enum: ["Up", "Down"], default: "Up" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// prevent duplicate same tripName under same route
TripTemplateSchema.index({ routeId: 1, tripName: 1 }, { unique: true });

module.exports = mongoose.model("TripTemplate", TripTemplateSchema);
