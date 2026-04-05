const router = require("express").Router();
const auth = require("../middleware/auth");
const passengerAuth = require("../middleware/passengerAuth");
const requireRole = require("../middleware/requireRole");
const {
  getBusRouteByQr,
  listPublicRoutes,
  getRouteLiveStatus,
  getTripEta,
  getTripLoad,
  notifyTripWaiting,
  getTripWaitingStatus,
  createDemoBooking,
  getBookingStatus,
  getBookingAnalytics
} = require("../controllers/public.controller");

router.get("/scan", getBusRouteByQr);
router.get("/routes", listPublicRoutes);
router.get("/routes/:routeId/live", getRouteLiveStatus);
router.get("/trips/:tripId/eta", getTripEta);
router.get("/trips/:tripId/load", getTripLoad);
router.post("/trips/:tripId/waiting", passengerAuth, notifyTripWaiting);
router.get("/trips/:tripId/waiting", passengerAuth, getTripWaitingStatus);
router.post("/bookings/demo", createDemoBooking);
router.get("/bookings/:bookingId/status", getBookingStatus);
router.get("/bookings/analytics", auth, requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getBookingAnalytics);

module.exports = router;
