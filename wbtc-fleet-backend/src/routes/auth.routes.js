const router = require("express").Router();
const { body } = require("express-validator");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const { createRateLimit, getClientIp } = require("../middleware/rateLimit");
const { register, login, changePassword } = require("../controllers/auth.controller");

const adminLoginLimiter = createRateLimit({
  name: "admin-login",
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `${getClientIp(req)}:${String(req.body?.username || "").trim().toLowerCase()}`,
  message: "Too many login attempts. Please try again later.",
});

const adminChangePasswordLimiter = createRateLimit({
  name: "admin-change-password",
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `${getClientIp(req)}:${String(req.user?.userId || "anonymous")}`,
  message: "Too many password change attempts. Please try again later.",
});

router.post("/register", auth, requireRole("ADMIN"), register);
router.post(
  "/login",
  adminLoginLimiter,
  validate([
    body("username")
      .trim()
      .isLength({ min: 1, max: 64 })
      .withMessage("username is required"),
    body("password")
      .isString()
      .isLength({ min: 1, max: 128 })
      .withMessage("password is required"),
  ]),
  login
);
router.post(
  "/change-password",
  auth,
  adminChangePasswordLimiter,
  validate([
    body("currentPassword")
      .isString()
      .isLength({ min: 1, max: 128 })
      .withMessage("currentPassword is required"),
    body("newPassword")
      .isString()
      .isLength({ min: 8, max: 128 })
      .withMessage("newPassword must be between 8 and 128 characters"),
    body("newPassword").custom((value, { req }) => {
      if (String(value) === String(req.body?.currentPassword || "")) {
        throw new Error("newPassword must be different from currentPassword");
      }
      return true;
    }),
  ]),
  changePassword
);

module.exports = router;
