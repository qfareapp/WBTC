const mongoose = require("mongoose");

const BusReturnLogSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus", required: true, index: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    returnTime: { type: String }, // "21:30"
    kmRun: { type: Number, default: 0 },
    fuelLevel: { type: Number, default: 0 }, // %
    cleanlinessStatus: { type: String, enum: ["Good", "Average", "Poor"], default: "Good" },
    defectReported: { type: Boolean, default: false },
    remarks: { type: String },
  },
  { timestamps: true }
);

BusReturnLogSchema.index({ date: 1, busId: 1 }, { unique: true });

module.exports = mongoose.model("BusReturnLog", BusReturnLogSchema);
