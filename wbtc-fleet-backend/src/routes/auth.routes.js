const router = require("express").Router();
const auth = require("../middleware/auth");
const { register, login, changePassword } = require("../controllers/auth.controller");

router.post("/register", register); // for now open; later lock to ADMIN only
router.post("/login", login);
router.post("/change-password", auth, changePassword);

module.exports = router;
