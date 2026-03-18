const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const {
  getBusRouteByQr,
  listPublicRoutes,
  getRouteLiveStatus,
  createDemoBooking,
  getBookingAnalytics
} = require("../controllers/public.controller");

router.get("/scan", getBusRouteByQr);
router.get("/routes", listPublicRoutes);
router.get("/routes/:routeId/live", getRouteLiveStatus);
router.post("/bookings/demo", createDemoBooking);
router.get("/bookings/analytics", auth, requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getBookingAnalytics);

module.exports = router;
