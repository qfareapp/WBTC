const mongoose = require("mongoose");

const MaintenanceSchema = new mongoose.Schema(
  {
    busId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus", required: true, index: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    type: { type: String, enum: ["Scheduled", "Breakdown"], required: true },
    issue: { type: String, required: true },
    reportedOn: { type: Date, default: Date.now },
    resolvedOn: { type: Date, default: null },
    status: { type: String, enum: ["Open", "InProgress", "Closed"], default: "Open", index: true },
    costEstimate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Maintenance", MaintenanceSchema);
