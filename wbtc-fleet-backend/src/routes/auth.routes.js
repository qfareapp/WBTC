const router = require("express").Router();
const { register, login } = require("../controllers/auth.controller");

router.post("/register", register); // for now open; later lock to ADMIN only
router.post("/login", login);

module.exports = router;
