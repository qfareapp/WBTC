const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const {
  listOwnersOverview,
  getOwnerTagContext,
  getBusAttachedRoutes,
  tagBusToOwner,
  listOwnerDuePayments,
  virtualPayOwnerDue,
} = require("../controllers/ownerAdmin.controller");

router.use(auth, requireRole("ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"));

router.get("/", listOwnersOverview);
router.get("/payments", listOwnerDuePayments);
router.post("/:ownerId/payments/virtual-pay", requireRole("ADMIN", "DEPOT_MANAGER"), virtualPayOwnerDue);
router.get("/tag-context", getOwnerTagContext);
router.get("/buses/:busId/routes", getBusAttachedRoutes);
router.post("/:ownerId/tag-bus", requireRole("ADMIN", "DEPOT_MANAGER"), tagBusToOwner);

module.exports = router;
