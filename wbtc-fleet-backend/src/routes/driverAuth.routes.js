const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { loginDriver, changeDriverPassword } = require("../controllers/driverAuth.controller");

router.post("/login", loginDriver);
router.post("/change-password", auth, requireRole("DRIVER"), changeDriverPassword);

module.exports = router;
