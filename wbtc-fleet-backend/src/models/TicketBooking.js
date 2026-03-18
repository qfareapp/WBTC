const mongoose = require("mongoose");

const TicketBookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true, index: true },
    busNumber: { type: String, required: true, index: true },
    routeId: { type: String, required: true, index: true },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", default: null, index: true },
    tripInstanceId: { type: mongoose.Schema.Types.ObjectId, ref: "TripInstance", default: null, index: true },
    source: { type: String, required: true },
    destination: { type: String, required: true },
    fare: { type: Number, default: 0 },
    status: { type: String, enum: ["PAID", "CANCELLED"], default: "PAID", index: true },
    paymentMode: { type: String, enum: ["ONLINE", "CASH"], default: "ONLINE", index: true },
    issuedByRole: { type: String, enum: ["PASSENGER_APP", "CONDUCTOR"], default: "PASSENGER_APP", index: true },
    issuedById: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    passengerCount: { type: Number, default: 1 },
    bookedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

TicketBookingSchema.index({ bookedAt: 1, status: 1 });

module.exports = mongoose.model("TicketBooking", TicketBookingSchema);
