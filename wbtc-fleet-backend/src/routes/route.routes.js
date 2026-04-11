const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const {
  createRouteWithFare,
  getRouteFare,
  listRoutes,
  updateRouteWithFare,
  updateAssignmentMode,
  getRouteDayStatus,
  activateRouteDay,
  deactivateRouteDay,
  releaseRouteBusForDate,
  getRoutePerformance,
  searchStops,
} = require("../controllers/route.controller");
const { getStopImageUploadSignature } = require("../controllers/upload.controller");

router.use(auth);

router.post(
  "/uploads/stop-image-signature",
  requireRole("ADMIN", "DEPOT_MANAGER"),
  getStopImageUploadSignature
);
router.post("/", requireRole("ADMIN", "DEPOT_MANAGER"), createRouteWithFare);
router.put("/:id", requireRole("ADMIN", "DEPOT_MANAGER"), updateRouteWithFare);
router.patch("/:id/assignment-mode", requireRole("ADMIN", "DEPOT_MANAGER"), updateAssignmentMode);
router.get("/:id/day-status", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getRouteDayStatus);
router.post("/:id/activate-day", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER"), activateRouteDay);
router.post("/:id/deactivate-day", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER"), deactivateRouteDay);
router.post("/:id/release-bus", requireRole("ADMIN", "DEPOT_MANAGER"), releaseRouteBusForDate);
router.get("/performance", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getRoutePerformance);
router.get("/stops/search", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), searchStops);
router.get("/", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), listRoutes);
router.get("/:id", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getRouteFare);

module.exports = router;
