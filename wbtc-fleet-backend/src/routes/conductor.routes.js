const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { createConductor, listConductors, updateConductor } = require("../controllers/conductor.controller");

router.use(auth);

router.post("/", requireRole("ADMIN", "DEPOT_MANAGER"), createConductor);
router.get("/", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), listConductors);
router.patch("/:id", requireRole("ADMIN", "DEPOT_MANAGER"), updateConductor);

module.exports = router;
