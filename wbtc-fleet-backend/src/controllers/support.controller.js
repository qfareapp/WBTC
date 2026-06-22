const ApiError = require("../utils/ApiError");
const { getSupportNode } = require("../services/passengerSupportFlow.service");
const TicketBooking = require("../models/TicketBooking");

const buildRecentBookings = async ({ passengerId, scope }) => {
  if (!passengerId || !scope) return [];

  const query = {
    issuedByRole: "PASSENGER_APP",
    issuedById: passengerId,
  };

  if (scope === "payments") {
    query.paymentMode = "ONLINE";
  }

  const rows = await TicketBooking.find(query)
    .sort({ bookedAt: -1 })
    .limit(5)
    .select(
      "bookingId busNumber routeId source destination fare passengerCount status paymentMode paymentStatus razorpayOrderId razorpayPaymentId bookedAt paymentCapturedAt"
    )
    .lean();

  return rows.map(row => ({
    bookingId: row.bookingId,
    busNumber: row.busNumber || null,
    routeId: row.routeId || null,
    source: row.source || null,
    destination: row.destination || null,
    fare: Number(row.fare) || 0,
    passengerCount: Number(row.passengerCount) || 1,
    status: row.status || null,
    paymentMode: row.paymentMode || null,
    paymentStatus: row.paymentStatus || null,
    razorpayOrderId: row.razorpayOrderId || null,
    razorpayPaymentId: row.razorpayPaymentId || null,
    bookedAt: row.bookedAt || null,
    paymentCapturedAt: row.paymentCapturedAt || null,
  }));
};

exports.getSupportMenu = async (req, res, next) => {
  try {
    const nodeId = req.params.nodeId || req.query.nodeId;
    const node = getSupportNode(nodeId);

    if (!node) {
      return next(new ApiError(404, "Support option not found"));
    }

    const recentBookings = await buildRecentBookings({
      passengerId: req.passenger?.passengerId,
      scope: node.recentBookingScope,
    });

    res.json({
      ok: true,
      node,
      context: {
        recentBookings,
      },
    });
  } catch (err) {
    next(err);
  }
};
