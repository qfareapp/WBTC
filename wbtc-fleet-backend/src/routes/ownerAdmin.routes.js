const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const {
  listOwnersOverview,
  getOwnerTagContext,
  getBusAttachedRoutes,
  tagBusToOwner,
  listOwnerDuePayments,
  getOwnerPaymentBreakdown,
  virtualPayOwnerDue,
  resetOwnerPassword,
} = require("../controllers/ownerAdmin.controller");

router.use(auth);

router.get("/", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), listOwnersOverview);
router.get("/payments", requireRole("ADMIN", "DEPOT_MANAGER"), listOwnerDuePayments);
router.get("/:ownerId/payments/details", requireRole("ADMIN", "DEPOT_MANAGER"), getOwnerPaymentBreakdown);
router.post("/:ownerId/payments/virtual-pay", requireRole("ADMIN", "DEPOT_MANAGER"), virtualPayOwnerDue);
router.get("/tag-context", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getOwnerTagContext);
router.get("/buses/:busId/routes", requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"), getBusAttachedRoutes);
router.post("/:ownerId/tag-bus", requireRole("ADMIN", "DEPOT_MANAGER"), tagBusToOwner);
router.post("/:ownerId/reset-password", requireRole("ADMIN", "DEPOT_MANAGER"), resetOwnerPassword);

module.exports = router;
