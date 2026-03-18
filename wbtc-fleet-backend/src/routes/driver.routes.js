const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { createDriver, listDrivers, updateDriver } = require("../controllers/driver.controller");

router.use(auth);

router.post("/", requireRole("ADMIN", "DEPOT_MANAGER"), createDriver);
router.get("/", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), listDrivers);
router.patch("/:id", requireRole("ADMIN", "DEPOT_MANAGER"), updateDriver);

module.exports = router;
