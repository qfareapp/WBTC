const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { loginConductor, changeConductorPassword } = require("../controllers/conductorAuth.controller");

router.post("/login", loginConductor);
router.post("/change-password", auth, requireRole("CONDUCTOR"), changeConductorPassword);

module.exports = router;
