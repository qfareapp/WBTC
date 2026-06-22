const router = require("express").Router();
const { body, param } = require("express-validator");
const auth = require("../middleware/auth");
const passengerAuth = require("../middleware/passengerAuth");
const requireRole = require("../middleware/requireRole");
const { createRateLimit, getClientIp } = require("../middleware/rateLimit");
const validate = require("../middleware/validate");
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

const bookingContextValidators = [
  body("busNumber")
    .trim()
    .isLength({ min: 1, max: 40 })
    .withMessage("Bus number is required"),
  body("routeId")
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage("Route ID is required"),
  body("source")
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage("Source stop is required"),
  body("destination")
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage("Destination stop is required"),
  body("passengerCount")
    .isInt({ min: 1, max: 5 })
    .withMessage("Passenger count must be between 1 and 5"),
];

const paymentVerifyValidators = [
  ...bookingContextValidators,
  body("razorpay_payment_id")
    .trim()
    .isLength({ min: 6, max: 120 })
    .withMessage("Missing Razorpay payment ID"),
  body("razorpay_order_id")
    .trim()
    .isLength({ min: 6, max: 120 })
    .withMessage("Missing Razorpay order ID"),
  body("razorpay_signature")
    .trim()
    .isLength({ min: 6, max: 200 })
    .withMessage("Missing Razorpay signature"),
];

const bookingIdParamValidator = param("bookingId")
  .trim()
  .matches(/^[A-Za-z0-9_-]{4,80}$/)
  .withMessage("Invalid booking ID");

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
router.post(
  "/payments/razorpay/order",
  passengerAuth,
  passengerPaymentOrderRateLimit,
  validate(bookingContextValidators),
  createPassengerPaymentOrder
);
router.post(
  "/payments/razorpay/verify",
  passengerAuth,
  passengerPaymentVerifyRateLimit,
  validate(paymentVerifyValidators),
  verifyPassengerPaymentAndCreateBooking
);
router.post("/payments/razorpay/webhook", handleRazorpayWebhook);
router.post("/bookings/demo", createDemoBooking);
router.get(
  "/bookings/:bookingId/status",
  passengerAuth,
  publicLookupRateLimit,
  validate([bookingIdParamValidator]),
  getBookingStatus
);
router.get("/bookings/analytics", auth, requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getBookingAnalytics);
router.get("/bookings/users", auth, requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getPassengerRegistry);

module.exports = router;
