const mongoose = require("mongoose");

const DailyBusAllocationSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true }, // "YYYY-MM-DD"
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus", required: true, index: true },
    status: { type: String, enum: ["Scheduled", "Cancelled", "Breakdown"], default: "Scheduled" },
    remarks: { type: String },
  },
  { timestamps: true }
);

// one bus once per day
DailyBusAllocationSchema.index({ date: 1, busId: 1 }, { unique: true });

module.exports = mongoose.model("DailyBusAllocation", DailyBusAllocationSchema);
