const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { register, login, changePassword } = require("../controllers/auth.controller");

router.post("/register", auth, requireRole("ADMIN"), register);
router.post("/login", login);
router.post("/change-password", auth, changePassword);

module.exports = router;
