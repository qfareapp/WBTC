const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const {
  listConductorOffers,
  acceptConductorOffer,
  rejectConductorOffer,
  getCurrentConductorTrip,
  updateConductorDuty,
  updateConductorDutyLocation,
  updateConductorLocation,
  listConductorDutyLocations,
  getConductorFare,
  issueConductorTicket,
  listConductorTickets,
  getConductorSummary,
  completeConductorTrip,
} = require("../controllers/conductorTrip.controller");

router.use(auth, requireRole("CONDUCTOR"));

router.get("/offers", listConductorOffers);
router.post("/offers/accept", acceptConductorOffer);
router.post("/offers/reject", rejectConductorOffer);
router.get("/current", getCurrentConductorTrip);
router.post("/duty", updateConductorDuty);
router.post("/duty-location", updateConductorDutyLocation);
router.post("/location", updateConductorLocation);
router.get("/locations", listConductorDutyLocations);
router.get("/fare", getConductorFare);
router.post("/tickets", issueConductorTicket);
router.get("/tickets", listConductorTickets);
router.post("/complete-trip", completeConductorTrip);
router.get("/summary", getConductorSummary);

module.exports = router;
