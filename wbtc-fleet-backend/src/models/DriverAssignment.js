const mongoose = require("mongoose");

const DriverAssignmentSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true }, // "YYYY-MM-DD"
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", required: true, index: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus", required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true, index: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    tripTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "TripTemplate", required: true, index: true },
    tripInstanceId: { type: mongoose.Schema.Types.ObjectId, ref: "TripInstance", default: null, index: true },
    startTime: { type: String },
    endTime: { type: String },
    restUntilTime: { type: String },
    shift: { type: String, enum: ["Morning", "Evening", "General"], default: "General" },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["Scheduled", "Active", "Completed"], default: "Scheduled", index: true },
  },
  { timestamps: true }
);

// prevent same bus taking same trip twice on same day
DriverAssignmentSchema.index({ date: 1, busId: 1, tripTemplateId: 1 }, { unique: true });

// prevent same driver getting assigned to same trip slot twice on same day
DriverAssignmentSchema.index({ date: 1, driverId: 1, tripTemplateId: 1 }, { unique: true });

module.exports = mongoose.model("DriverAssignment", DriverAssignmentSchema);
