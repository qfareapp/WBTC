const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { createConductor, listConductors, updateConductor, resetConductorPassword } = require("../controllers/conductor.controller");

router.use(auth);

router.post("/", requireRole("ADMIN", "DEPOT_MANAGER"), createConductor);
router.get("/", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER", "OWNER"), listConductors);
router.patch("/:id", requireRole("ADMIN", "DEPOT_MANAGER"), updateConductor);
router.post("/:id/reset-password", requireRole("ADMIN", "DEPOT_MANAGER", "OWNER"), resetConductorPassword);

module.exports = router;
