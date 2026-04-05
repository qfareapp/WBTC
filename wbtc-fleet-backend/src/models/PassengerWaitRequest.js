const mongoose = require("mongoose");

const PassengerWaitRequestSchema = new mongoose.Schema(
  {
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PassengerUser",
      required: true,
      index: true,
    },
    tripInstanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TripInstance",
      required: true,
      index: true,
    },
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      required: true,
      index: true,
    },
    stopName: { type: String, required: true, trim: true },
    stopIndex: { type: Number, required: true },
    status: {
      type: String,
      enum: ["Waiting", "Cancelled"],
      default: "Waiting",
      index: true,
    },
    notifiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

PassengerWaitRequestSchema.index(
  { passengerId: 1, tripInstanceId: 1 },
  { unique: true }
);

PassengerWaitRequestSchema.index({ tripInstanceId: 1, status: 1, stopIndex: 1 });

module.exports = mongoose.model("PassengerWaitRequest", PassengerWaitRequestSchema);
