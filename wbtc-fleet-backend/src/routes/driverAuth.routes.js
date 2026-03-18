const router = require("express").Router();
const { loginDriver } = require("../controllers/driverAuth.controller");

router.post("/login", loginDriver);

module.exports = router;
