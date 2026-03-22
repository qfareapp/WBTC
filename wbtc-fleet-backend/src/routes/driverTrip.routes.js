const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const {
  listDriverTrips,
  getDriverTrip,
  startDriverTrip,
  completeDriverTrip,
  updateDriverLocation,
  updateDriverDuty,
  updateDriverDutyLocation,
  registerPushToken,
  unregisterPushToken,
  listTripOffers,
  acceptTripOffer,
  rejectTripOffer,
  cancelAcceptedTrip,
  listDutyLocations,
  getDriverSummary,
} = require("../controllers/driverTrip.controller");

router.use(auth, requireRole("DRIVER"));

router.get("/", listDriverTrips);
router.get("/summary", getDriverSummary);
router.get("/locations", listDutyLocations);
router.post("/push-token", registerPushToken);
router.delete("/push-token", unregisterPushToken);
router.get("/offers", listTripOffers);
router.get("/:tripInstanceId", getDriverTrip);
router.post("/start", startDriverTrip);
router.post("/complete", completeDriverTrip);
router.post("/location", updateDriverLocation);
router.post("/duty", updateDriverDuty);
router.post("/duty-location", updateDriverDutyLocation);
router.post("/offers/accept", acceptTripOffer);
router.post("/offers/reject", rejectTripOffer);
router.post("/offers/cancel", cancelAcceptedTrip);

module.exports = router;
