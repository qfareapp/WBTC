const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const {
  getOwnerFleetDashboard,
  listOwnerPersonnel,
  updateOwnerBusStatus,
  assignOwnerBusCrew,
  resetOwnerBusCrew,
  getOwnerAssignCrewContext,
  assignOwnerDailyCrew,
  getOwnerPaymentSummary,
  getOwnerBilling,
  updateOwnerBusLocation,
  resetOwnerBusLocation,
  updateOwnerBusRoute,
  getOwnerPayoutDetails,
  updateOwnerPayoutDetails,
} = require("../controllers/owner.controller");

router.use(auth, requireRole("OWNER"));

router.get("/dashboard", getOwnerFleetDashboard);
router.get("/payout-details", getOwnerPayoutDetails);
router.put("/payout-details", updateOwnerPayoutDetails);
router.get("/payment-summary", getOwnerPaymentSummary);
router.get("/billing", getOwnerBilling);
router.get("/personnel", listOwnerPersonnel);
router.get("/assign-crew", getOwnerAssignCrewContext);
router.post("/assign-crew", assignOwnerDailyCrew);
router.patch("/buses/:busId/status", updateOwnerBusStatus);
router.patch("/buses/:busId/route", updateOwnerBusRoute);
router.patch("/buses/:busId/location", updateOwnerBusLocation);
router.post("/buses/:busId/location/reset", resetOwnerBusLocation);
router.post("/buses/:busId/assign-crew", assignOwnerBusCrew);
router.delete("/buses/:busId/assign-crew", resetOwnerBusCrew);

module.exports = router;
