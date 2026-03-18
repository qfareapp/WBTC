const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const {
  listTrips,
  getLiveTrips,
  getOtpSummary,
  getTodaySummary,
  activateTrip,
  completeTrip,
} = require("../controllers/tripInstance.controller");

router.use(auth);

router.get("/", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), listTrips);
router.get("/live", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getLiveTrips);
router.get("/otp-summary", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getOtpSummary);
router.get("/today-summary", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getTodaySummary);
router.post("/activate", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER"), activateTrip);
router.post("/complete", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER"), completeTrip);

module.exports = router;
