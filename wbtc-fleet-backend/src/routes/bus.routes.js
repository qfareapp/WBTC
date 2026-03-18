const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { createBus, listBuses, attachRouteToBus, updateBus } = require("../controllers/bus.controller");

router.use(auth);

router.post("/", requireRole("ADMIN", "DEPOT_MANAGER"), createBus);
router.get("/", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), listBuses);
router.patch("/:id", requireRole("ADMIN", "DEPOT_MANAGER"), updateBus);
router.patch("/:id/attach-route", requireRole("ADMIN", "DEPOT_MANAGER"), attachRouteToBus);

module.exports = router;
