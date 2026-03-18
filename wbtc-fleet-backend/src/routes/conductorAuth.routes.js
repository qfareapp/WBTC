const router = require("express").Router();
const { loginConductor } = require("../controllers/conductorAuth.controller");

router.post("/login", loginConductor);

module.exports = router;

