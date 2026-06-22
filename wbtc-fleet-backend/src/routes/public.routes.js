const router = require("express").Router();
const auth = require("../middleware/auth");
const passengerAuth = require("../middleware/passengerAuth");
const requireRole = require("../middleware/requireRole");
const { createRateLimit, getClientIp } = require("../middleware/rateLimit");
const {
  getBusRouteByQr,
  getNearestStop,
  getNearbyLiveTrips,
  listPublicRoutes,
  getRouteLiveStatus,
  getTripEta,
  getTripLoad,
  notifyTripWaiting,
  getTripWaitingStatus,
  createDemoBooking,
  createPassengerPaymentOrder,
  verifyPassengerPaymentAndCreateBooking,
  handleRazorpayWebhook,
  getBookingStatus,
  getBookingAnalytics,
  getPassengerRegistry,
} = require("../controllers/public.controller");
const { getSupportMenu } = require("../controllers/support.controller");

const publicLookupRateLimit = createRateLimit({
  name: "public-lookup",
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: getClientIp,
  message: "Too many requests. Please slow down and try again shortly.",
});

const passengerPaymentOrderRateLimit = createRateLimit({
  name: "passenger-payment-order",
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: req => `${getClientIp(req)}:${String(req.passenger?.passengerId || "unknown")}`,
  message: "Too many payment order requests. Please wait before trying again.",
});

const passengerPaymentVerifyRateLimit = createRateLimit({
  name: "passenger-payment-verify",
  windowMs: 10 * 60 * 1000,
  max: 12,
  keyGenerator: req => `${getClientIp(req)}:${String(req.passenger?.passengerId || "unknown")}`,
  message: "Too many payment verification attempts. Please wait before trying again.",
});

router.get("/scan", publicLookupRateLimit, getBusRouteByQr);
router.get("/support/menu", passengerAuth, getSupportMenu);
router.get("/support/menu/:nodeId", passengerAuth, getSupportMenu);
router.get("/stops/nearest", publicLookupRateLimit, getNearestStop);
router.get("/trips/nearby", publicLookupRateLimit, getNearbyLiveTrips);
router.get("/routes", publicLookupRateLimit, listPublicRoutes);
router.get("/routes/:routeId/live", publicLookupRateLimit, getRouteLiveStatus);
router.get("/trips/:tripId/eta", publicLookupRateLimit, getTripEta);
router.get("/trips/:tripId/load", publicLookupRateLimit, getTripLoad);
router.post("/trips/:tripId/waiting", passengerAuth, notifyTripWaiting);
router.get("/trips/:tripId/waiting", passengerAuth, getTripWaitingStatus);
router.post("/payments/razorpay/order", passengerAuth, passengerPaymentOrderRateLimit, createPassengerPaymentOrder);
router.post("/payments/razorpay/verify", passengerAuth, passengerPaymentVerifyRateLimit, verifyPassengerPaymentAndCreateBooking);
router.post("/payments/razorpay/webhook", handleRazorpayWebhook);
router.post("/bookings/demo", createDemoBooking);
router.get("/bookings/:bookingId/status", publicLookupRateLimit, getBookingStatus);
router.get("/bookings/analytics", auth, requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getBookingAnalytics);
router.get("/bookings/users", auth, requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getPassengerRegistry);

module.exports = router;
