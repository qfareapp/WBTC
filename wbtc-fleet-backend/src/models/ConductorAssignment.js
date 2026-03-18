const mongoose = require("mongoose");

const ConductorAssignmentSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus", required: true, index: true },
    conductorId: { type: mongoose.Schema.Types.ObjectId, ref: "Conductor", required: true, index: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    tripInstanceId: { type: mongoose.Schema.Types.ObjectId, ref: "TripInstance", required: true, index: true },
    startTime: { type: String, default: null },
    endTime: { type: String, default: null },
    status: { type: String, enum: ["Scheduled", "Active", "Completed"], default: "Scheduled", index: true },
  },
  { timestamps: true }
);

ConductorAssignmentSchema.index({ date: 1, conductorId: 1, tripInstanceId: 1 }, { unique: true });

module.exports = mongoose.model("ConductorAssignment", ConductorAssignmentSchema);
