const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const {
  allocateBusForDay,
  assignDriver,
  logBusReturn,
  getDailySchedule
} = require("../controllers/dailyOps.controller");

router.use(auth);

router.post("/allocate-bus", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER"), allocateBusForDay);
router.post("/assign-driver", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER"), assignDriver);
router.post("/bus-return", requireRole("ADMIN", "DEPOT_MANAGER"), logBusReturn);
router.get("/schedule", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getDailySchedule);

module.exports = router;
