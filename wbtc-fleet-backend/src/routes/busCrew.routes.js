const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { upsertBusCrewMapping, listBusCrewMappings } = require("../controllers/busCrew.controller");

router.use(auth);

router.post("/", requireRole("ADMIN", "DEPOT_MANAGER"), upsertBusCrewMapping);
router.get("/", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), listBusCrewMappings);

module.exports = router;

