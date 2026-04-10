const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { loginDriver, getDriverProfile, changeDriverPassword } = require("../controllers/driverAuth.controller");

router.post("/login", loginDriver);
router.get("/me", auth, requireRole("DRIVER"), getDriverProfile);
router.post("/change-password", auth, requireRole("DRIVER"), changeDriverPassword);

module.exports = router;
