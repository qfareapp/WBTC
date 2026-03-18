const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { createDepot, listDepots, getDepot } = require("../controllers/depot.controller");

router.use(auth);

router.post("/", requireRole("ADMIN"), createDepot);
router.get("/", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), listDepots);
router.get("/:id", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getDepot);

module.exports = router;
