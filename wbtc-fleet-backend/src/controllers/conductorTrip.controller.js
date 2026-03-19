const mongoose = require("mongoose");
const Conductor = require("../models/Conductor");
const ConductorAssignment = require("../models/ConductorAssignment");
const ConductorOffer = require("../models/ConductorOffer");
const DriverAssignment = require("../models/DriverAssignment");
const BusCrewMapping = require("../models/BusCrewMapping");
const TripInstance = require("../models/TripInstance");
const Route = require("../models/Route");
const RouteStop = require("../models/RouteStop");
const Bus = require("../models/Bus");
const FareSlab = require("../models/FareSlab");
const TicketBooking = require("../models/TicketBooking");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { ensureConductorEligibleForBus } = require("../utils/crewPolicy");

const OPS_TIMEZONE = "Asia/Kolkata";

const getOpsNowParts = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const byType = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  const date = `${byType.year}-${byType.month}-${byType.day}`;
  const nowMinutes = Number(byType.hour) * 60 + Number(byType.minute);

  return { date, nowMinutes };
};

const today = () => getOpsNowParts().date;

const getOpsDayWindow = (isoDate) => {
  // Operations run in IST; use IST day boundaries for all daily filters.
  const start = new Date(`${isoDate}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const toMinutes = (time) => {
  if (!time) return null;
  const [hh, mm] = String(time).split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
};

const getStartLocation = (route, direction) => {
  if (!route || !route.source || !route.destination) return null;
  return direction === "UP" ? route.source : route.destination;
};

const getEndLocation = (route, direction) => {
  if (!route || !route.source || !route.destination) return null;
  return direction === "UP" ? route.destination : route.source;
};

const normalizeLocation = (value) => String(value || "").trim().toLowerCase();

const parseDate = (dateStr) => {
  const date = new Date(`${String(dateStr)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildActiveOnDateFilter = (dateStr) => {
  const dayStart = parseDate(dateStr);
  if (!dayStart) return {};
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  return {
    activeFrom: { $lt: dayEnd },
    $or: [{ activeTo: null }, { activeTo: { $gte: dayStart } }],
  };
};

const mapTripForConductor = async (assignment) => {
  const trip = await TripInstance.findById(assignment.tripInstanceId)
    .populate("routeId", "routeCode routeName source destination")
    .populate("busId", "busNumber busType");
  if (!trip) return null;
  const route = trip.routeId;

  return {
    assignmentId: assignment._id,
    tripInstanceId: trip._id,
    status: assignment.status,
    driverTripStatus: trip.status,
    direction: trip.direction,
    route: route
      ? {
          id: route._id,
          routeCode: route.routeCode,
          routeName: route.routeName,
          source: route.source,
          destination: route.destination,
        }
      : null,
    bus: trip.busId
      ? {
          id: trip.busId._id,
          busNumber: trip.busId.busNumber,
          busType: trip.busId.busType,
        }
      : null,
    timing: {
      startTime: trip.startTime || null,
      endTime: trip.endTime || null,
    },
    pickupLocation: getStartLocation(route, trip.direction),
    dropLocation: getEndLocation(route, trip.direction),
  };
};

const getFareForStops = async (routeId, source, destination) => {
  const [stops, slabs] = await Promise.all([
    RouteStop.find({ routeId }).sort({ index: 1 }).lean(),
    FareSlab.find({ routeId }).sort({ fromKm: 1 }).lean(),
  ]);

  const sourceStop = stops.find((stop) => String(stop.name).toLowerCase() === String(source).toLowerCase());
  const destinationStop = stops.find((stop) => String(stop.name).toLowerCase() === String(destination).toLowerCase());
  if (!sourceStop || !destinationStop) {
    throw new ApiError(400, "Invalid source or destination for route");
  }
  if (sourceStop.index === destinationStop.index) {
    throw new ApiError(400, "Source and destination cannot be same");
  }

  const distanceUnits = Math.abs(destinationStop.index - sourceStop.index);
  const slab = slabs.find((item) => distanceUnits >= item.fromKm && distanceUnits <= item.toKm);
  if (!slab) {
    throw new ApiError(404, "Fare slab not configured for selected stops");
  }

  return {
    fare: Number(slab.fare),
    distanceUnits,
    sourceStop,
    destinationStop,
    stops: stops.map((stop) => ({ index: stop.index, name: stop.name })),
  };
};

const cleanupStaleConductorAssignments = async ({ conductorId, date }) => {
  const openAssignments = await ConductorAssignment.find({
    conductorId,
    date,
    status: { $in: ["Scheduled", "Active"] },
  }).select("_id tripInstanceId");

  if (!openAssignments.length) return;

  const tripIds = openAssignments.map((item) => item.tripInstanceId).filter(Boolean);
  const trips = tripIds.length
    ? await TripInstance.find({ _id: { $in: tripIds } }).select("_id status")
    : [];
  const tripStatusById = new Map(trips.map((trip) => [String(trip._id), String(trip.status || "")]));

  const staleAssignmentIds = openAssignments
    .filter((assignment) => {
      const tripStatus = tripStatusById.get(String(assignment.tripInstanceId || ""));
      return !tripStatus || tripStatus === "Completed";
    })
    .map((assignment) => assignment._id);

  if (!staleAssignmentIds.length) return;

  await ConductorAssignment.updateMany(
    { _id: { $in: staleAssignmentIds } },
    { $set: { status: "Completed" } }
  );
};

exports.listConductorOffers = asyncHandler(async (req, res) => {
  const conductorId = req.user.userId;
  const date = req.query.date || today();
  const debug = String(req.query.debug || "").toLowerCase() === "true";
  const debugNoOffers = (reason, extra = {}) => {
    if (!debug) return { ok: true, date, offers: [] };
    return {
      ok: true,
      date,
      offers: [],
      debug: {
        enabled: true,
        totalCandidates: 0,
        skippedCount: 1,
        summary: { [reason]: 1 },
        skipped: [{ tripInstanceId: null, routeCode: null, startTime: null, reason }],
        ...extra,
      },
    };
  };
  const conductor = await Conductor.findById(conductorId);
  if (!conductor) throw new ApiError(404, "Conductor not found");

  await cleanupStaleConductorAssignments({ conductorId, date });

  if (conductor.status !== "Available") {
    return res.json(debugNoOffers("conductor_not_available"));
  }

  const activeAssignment = await ConductorAssignment.findOne({
    date,
    conductorId,
    status: { $in: ["Scheduled", "Active"] },
  }).select("_id");
  if (activeAssignment) {
    return res.json(debugNoOffers("conductor_has_active_assignment"));
  }

  const mappedRows = await BusCrewMapping.find({
    conductorId,
    isActive: true,
    ...buildActiveOnDateFilter(date),
  })
    .populate("busId", "busNumber busType currentLocation status depotId attachedRouteId")
    .select("busId driverId")
    .lean();
  if (!mappedRows.length) {
    return res.json(debugNoOffers("no_active_crew_mapping"));
  }
  const mappedBusDocs = mappedRows.map((row) => row.busId).filter(Boolean);
  const mappedBusIds = new Set(mappedBusDocs.map((bus) => String(bus._id)));
  const mappedBusById = new Map(mappedBusDocs.map((bus) => [String(bus._id), bus]));
  const mappedPairSet = new Set(
    mappedRows
      .map((row) => `${String(row.driverId || "")}:${String(row.busId?._id || row.busId || "")}`)
      .filter((value) => value !== ":")
  );
  const mappedDriverIds = Array.from(
    new Set(mappedRows.map((row) => String(row.driverId || "")).filter(Boolean))
  );
  const mappedBusIdList = Array.from(
    new Set(mappedRows.map((row) => String(row.busId?._id || row.busId || "")).filter(Boolean))
  );
  const { nowMinutes } = getOpsNowParts();

  const driverAcceptedRows = await DriverAssignment.find({
    date,
    status: { $in: ["Scheduled", "Active"] },
    driverId: { $in: mappedDriverIds },
    busId: { $in: mappedBusIdList },
  })
    .select("tripInstanceId driverId busId startTime");
  if (!driverAcceptedRows.length) {
    return res.json(debugNoOffers("mapped_driver_has_no_accepted_trip"));
  }

  const eligibleDriverAcceptedRows = driverAcceptedRows.filter((row) =>
    mappedPairSet.has(`${String(row.driverId || "")}:${String(row.busId || "")}`)
  );
  if (!eligibleDriverAcceptedRows.length) {
    return res.json(debugNoOffers("driver_assignment_not_mapped_to_conductor"));
  }

  const driverAcceptedByTripId = new Map(
    eligibleDriverAcceptedRows.map((row) => [String(row.tripInstanceId), row])
  );
  const tripIds = Array.from(driverAcceptedByTripId.keys());
  const trips = await TripInstance.find({
    _id: { $in: tripIds },
    date,
    status: { $in: ["Scheduled", "Active"] },
  })
    .populate("routeId", "routeCode routeName source destination assignmentMode depotId")
    .populate("busId", "busNumber busType")
    .sort({ startTime: 1 });
  if (!trips.length) {
    return res.json(debugNoOffers("mapped_driver_trip_not_available"));
  }

  const [assignments, rejects] = await Promise.all([
    ConductorAssignment.find({ tripInstanceId: { $in: tripIds } }).select("tripInstanceId"),
    ConductorOffer.find({ tripInstanceId: { $in: tripIds }, conductorId, status: "Rejected" }).select("tripInstanceId"),
  ]);

  const assignedSet = new Set(assignments.map((item) => String(item.tripInstanceId)));
  const rejectedSet = new Set(rejects.map((item) => String(item.tripInstanceId)));

  const offers = [];
  const skipped = [];
  const trackSkip = (trip, reason) => {
    if (!debug) return;
    skipped.push({
      tripInstanceId: trip?._id || null,
      routeCode: trip?.routeId?.routeCode || null,
      startTime: trip?.startTime || null,
      reason,
    });
  };
  for (const trip of trips) {
    const route = trip.routeId;
    const acceptedDriverRow = driverAcceptedByTripId.get(String(trip._id));
    if (!route) {
      trackSkip(trip, "missing_route");
      continue;
    }
    if (!acceptedDriverRow) {
      trackSkip(trip, "driver_not_assigned_to_trip");
      continue;
    }
    if (route.assignmentMode !== "AUTO") {
      trackSkip(trip, "route_not_auto");
      continue;
    }
    if (String(route.depotId) !== String(conductor.depotId)) {
      trackSkip(trip, "depot_mismatch");
      continue;
    }
    if (assignedSet.has(String(trip._id))) {
      trackSkip(trip, "trip_already_assigned");
      continue;
    }
    if (rejectedSet.has(String(trip._id))) {
      trackSkip(trip, "conductor_rejected_trip");
      continue;
    }

    const tripStartMinutes = toMinutes(trip.startTime);
    if (tripStartMinutes !== null && tripStartMinutes < nowMinutes - 10) {
      trackSkip(trip, "trip_offer_expired");
      continue;
    }

    const pickupLocation = getStartLocation(route, trip.direction);
    const mappedBusId = String(acceptedDriverRow.busId || "");
    if (!mappedBusId || (mappedBusIds.size > 0 && !mappedBusIds.has(mappedBusId))) {
      trackSkip(trip, "driver_bus_not_mapped_to_conductor");
      continue;
    }
    const mappedBus = mappedBusById.get(mappedBusId);

    const eligibility = await ensureConductorEligibleForBus({ busId: mappedBusId, conductorId, date });
    if (!eligibility.ok) {
      trackSkip(trip, `conductor_not_eligible:${eligibility.reason || "unknown"}`);
      continue;
    }

    offers.push({
      tripInstanceId: trip._id,
      direction: trip.direction,
      startTime: trip.startTime,
      endTime: trip.endTime,
      route: {
        id: route._id,
        routeCode: route.routeCode,
        routeName: route.routeName,
        source: route.source,
        destination: route.destination,
      },
      bus: {
        id: mappedBus?._id || mappedBusId,
        busNumber: mappedBus?.busNumber || trip.busId?.busNumber || "--",
        busType: mappedBus?.busType || trip.busId?.busType || null,
      },
      pickupLocation,
      dropLocation: getEndLocation(route, trip.direction),
    });
  }

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  if (!debug) {
    return res.json({ ok: true, date, offers });
  }
  const summary = skipped.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});
  return res.json({
    ok: true,
    date,
    offers,
    debug: {
      enabled: true,
      totalCandidates: trips.length,
      skippedCount: skipped.length,
      summary,
      skipped,
    },
  });
});

exports.acceptConductorOffer = asyncHandler(async (req, res) => {
  const { tripInstanceId } = req.body;
  const conductorId = req.user.userId;
  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");

  const targetTrip = await TripInstance.findById(tripInstanceId).select("date");
  if (!targetTrip) throw new ApiError(404, "Trip not found");
  await cleanupStaleConductorAssignments({ conductorId, date: targetTrip.date });

  const [conductor, trip] = await Promise.all([
    Conductor.findById(conductorId),
    TripInstance.findById(tripInstanceId).populate("routeId", "routeCode routeName source destination assignmentMode depotId"),
  ]);
  if (!conductor) throw new ApiError(404, "Conductor not found");
  if (!trip) throw new ApiError(404, "Trip not found");
  if (!["Scheduled", "Active"].includes(String(trip.status || ""))) throw new ApiError(409, "Trip not available");
  if (!trip.routeId || trip.routeId.assignmentMode !== "AUTO") throw new ApiError(400, "Trip not in AUTO mode");
  if (conductor.status !== "Available") throw new ApiError(409, "Conductor not on duty");

  const activeAssignment = await ConductorAssignment.findOne({
    date: trip.date,
    conductorId,
    status: { $in: ["Scheduled", "Active"] },
  });
  if (activeAssignment) throw new ApiError(409, "Finish current trip before accepting a new offer");

  const { nowMinutes } = getOpsNowParts();
  const tripStartMinutes = toMinutes(trip.startTime);
  if (tripStartMinutes !== null && tripStartMinutes < nowMinutes - 10) {
    throw new ApiError(409, "Trip offer expired");
  }

  const driverAssignment = await DriverAssignment.findOne({
    date: trip.date,
    tripInstanceId: trip._id,
    status: { $in: ["Scheduled", "Active"] },
  }).select("driverId busId");
  if (!driverAssignment) {
    throw new ApiError(409, "Driver has not accepted this trip yet");
  }

  const mappedRow = await BusCrewMapping.findOne({
    conductorId,
    driverId: driverAssignment.driverId,
    busId: driverAssignment.busId,
    isActive: true,
    ...buildActiveOnDateFilter(trip.date),
  })
    .populate("busId", "currentLocation status depotId attachedRouteId")
    .select("busId")
    .lean();
  if (!mappedRow?.busId) {
    throw new ApiError(409, "Mapped driver-conductor-bus pairing not found");
  }
  const startLocation = getStartLocation(trip.routeId, trip.direction);
  const effectiveConductorLocation = mappedRow.busId?.currentLocation || conductor.currentLocation || null;
  if (
    normalizeLocation(effectiveConductorLocation) &&
    normalizeLocation(startLocation) &&
    normalizeLocation(effectiveConductorLocation) !== normalizeLocation(startLocation)
  ) {
    throw new ApiError(409, "Conductor not at pickup location");
  }

  let assignedBusId = String(driverAssignment.busId || "");
  if (!assignedBusId) {
    throw new ApiError(409, "Driver accepted trip without mapped bus");
  }
  if (String(trip.busId || "") !== assignedBusId) {
    trip.busId = assignedBusId;
    await trip.save();
  }

  const eligibility = await ensureConductorEligibleForBus({
    busId: assignedBusId,
    conductorId,
    date: trip.date,
  });
  if (!eligibility.ok) throw new ApiError(409, eligibility.reason);

  const existingAssignment = await ConductorAssignment.findOne({ tripInstanceId: trip._id });
  if (existingAssignment) throw new ApiError(409, "Trip already assigned to conductor");

  const assignment = await ConductorAssignment.create({
    date: trip.date,
    depotId: trip.depotId,
    busId: assignedBusId,
    conductorId,
    routeId: trip.routeId._id,
    tripInstanceId: trip._id,
    startTime: trip.startTime,
    endTime: trip.endTime,
    status: String(trip.status || "") === "Active" ? "Active" : "Scheduled",
  });

  await ConductorOffer.findOneAndUpdate(
    { tripInstanceId: trip._id, conductorId },
    { status: "Accepted" },
    { upsert: true, new: true }
  );

  res.json({ ok: true, assignment });
});

exports.rejectConductorOffer = asyncHandler(async (req, res) => {
  const { tripInstanceId } = req.body;
  const conductorId = req.user.userId;
  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");

  await ConductorOffer.findOneAndUpdate(
    { tripInstanceId, conductorId },
    { status: "Rejected" },
    { upsert: true, new: true }
  );

  res.json({ ok: true });
});

exports.getCurrentConductorTrip = asyncHandler(async (req, res) => {
  const conductorId = req.user.userId;
  const date = req.query.date || today();

  const assignment = await ConductorAssignment.findOne({
    conductorId,
    date,
    status: { $in: ["Scheduled", "Active"] },
  }).sort({ updatedAt: -1 });

  if (!assignment) {
    return res.json({ ok: true, trip: null });
  }

  const mapped = await mapTripForConductor(assignment);
  if (!mapped) return res.json({ ok: true, trip: null });
  if (mapped.status === "Scheduled" && mapped.driverTripStatus === "Active") {
    assignment.status = "Active";
    await assignment.save();
    mapped.status = "Active";
  }
  mapped.ticketingEnabled = ["Active", "Completed"].includes(String(mapped.driverTripStatus || ""));
  mapped.driverEnded = String(mapped.driverTripStatus || "") === "Completed";
  mapped.canEndTrip = mapped.driverEnded === true;
  const stops = await RouteStop.find({ routeId: mapped.route?.id }).sort({ index: 1 }).select("index name");

  res.json({ ok: true, trip: mapped, stops });
});

exports.updateConductorDuty = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const conductorId = req.user.userId;

  if (!status) throw new ApiError(400, "status required");
  if (!["Available", "OnLeave"].includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const conductor = await Conductor.findById(conductorId);
  if (!conductor) throw new ApiError(404, "Conductor not found");

  conductor.status = status;
  await conductor.save();

  res.json({
    ok: true,
    conductor: {
      id: conductor._id,
      name: conductor.name,
      empId: conductor.empId,
      status: conductor.status,
      currentLocation: conductor.currentLocation || null,
    },
  });
});

exports.updateConductorDutyLocation = asyncHandler(async (req, res) => {
  throw new ApiError(403, "Conductor duty location is managed automatically from assigned bus start point");
});

exports.listConductorDutyLocations = asyncHandler(async (req, res) => {
  const conductorId = req.user.userId;
  const conductor = await Conductor.findById(conductorId);
  if (!conductor) throw new ApiError(404, "Conductor not found");

  const routes = await Route.find({ depotId: conductor.depotId }).select("source destination").lean();
  const locations = Array.from(
    new Set(
      routes
        .flatMap((route) => [route.source, route.destination])
        .filter(Boolean)
        .map((value) => String(value))
    )
  );

  res.json({ ok: true, locations });
});

exports.getConductorFare = asyncHandler(async (req, res) => {
  const conductorId = req.user.userId;
  const tripInstanceId = String(req.query.tripInstanceId || "");
  const source = String(req.query.source || "").trim();
  const destination = String(req.query.destination || "").trim();

  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");
  if (!source || !destination) throw new ApiError(400, "source and destination required");

  const assignment = await ConductorAssignment.findOne({
    conductorId,
    tripInstanceId,
    status: { $in: ["Scheduled", "Active"] },
  });
  if (!assignment) throw new ApiError(403, "Conductor is not assigned to this trip");

  const fareInfo = await getFareForStops(assignment.routeId, source, destination);
  res.json({ ok: true, fare: fareInfo.fare, distanceUnits: fareInfo.distanceUnits, stops: fareInfo.stops });
});

exports.issueConductorTicket = asyncHandler(async (req, res) => {
  const conductorId = req.user.userId;
  const { tripInstanceId, source, destination, paymentMode = "CASH", passengerCount = 1 } = req.body;
  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");
  if (!source || !destination) throw new ApiError(400, "source and destination required");

  const assignment = await ConductorAssignment.findOne({
    conductorId,
    tripInstanceId,
    status: { $in: ["Scheduled", "Active"] },
  });
  if (!assignment) throw new ApiError(403, "Conductor is not assigned to this trip");

  const trip = await TripInstance.findById(tripInstanceId)
    .populate("busId", "busNumber")
    .select("routeId depotId status");
  if (!trip) throw new ApiError(404, "Trip not found");
  if (!["Active", "Completed"].includes(String(trip.status))) {
    throw new ApiError(409, "Ticketing starts only after driver starts the trip");
  }

  const fareInfo = await getFareForStops(assignment.routeId, source, destination);
  const pax = Number(passengerCount);
  const count = Number.isFinite(pax) && pax > 0 ? Math.floor(pax) : 1;
  if (count > 5) {
    throw new ApiError(400, "Maximum 5 passengers allowed per ticket");
  }
  const unitFare = Number(fareInfo.fare);
  const totalFare = unitFare * count;
  const bookingId = `CT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const booking = await TicketBooking.create({
    bookingId,
    busNumber: trip.busId?.busNumber || "NA",
    routeId: String(trip.routeId),
    depotId: trip.depotId || null,
    tripInstanceId: trip._id,
    source: String(source),
    destination: String(destination),
    fare: totalFare,
    status: "PAID",
    passengerCount: count,
    bookedAt: new Date(),
    paymentMode: ["CASH", "ONLINE"].includes(String(paymentMode).toUpperCase())
      ? String(paymentMode).toUpperCase()
      : "CASH",
    issuedByRole: "CONDUCTOR",
    issuedById: conductorId,
  });

  res.status(201).json({
    ok: true,
    ticket: {
      id: booking._id,
      bookingId: booking.bookingId,
      busNumber: booking.busNumber,
      source: booking.source,
      destination: booking.destination,
      fare: booking.fare,
      passengerCount: booking.passengerCount,
      paymentMode: booking.paymentMode,
      bookedAt: booking.bookedAt,
    },
    printable: {
      bookingId: booking.bookingId,
      source: booking.source,
      destination: booking.destination,
      passengerCount: booking.passengerCount,
      fare: booking.fare,
      paymentMode: booking.paymentMode,
      bookedAt: booking.bookedAt,
    },
  });
});

exports.completeConductorTrip = asyncHandler(async (req, res) => {
  const conductorId = req.user.userId;
  const { tripInstanceId } = req.body;
  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");

  const assignment = await ConductorAssignment.findOne({
    conductorId,
    tripInstanceId,
    status: { $in: ["Scheduled", "Active"] },
  });
  if (!assignment) throw new ApiError(404, "No open conductor assignment found");

  const trip = await TripInstance.findById(tripInstanceId).select("status routeId direction busId");
  if (!trip) throw new ApiError(404, "Trip not found");
  if (trip.status !== "Completed") {
    throw new ApiError(409, "Driver must complete trip before conductor can end it");
  }

  assignment.status = "Completed";
  await assignment.save();

  res.json({ ok: true, assignment });
});

exports.listConductorTickets = asyncHandler(async (req, res) => {
  const conductorId = req.user.userId;
  const date = String(req.query.date || today());

  const dayWindow = getOpsDayWindow(date);
  if (!dayWindow) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }
  const { start, end } = dayWindow;

  const issuedByIdFilters = [conductorId];
  if (mongoose.Types.ObjectId.isValid(conductorId)) {
    issuedByIdFilters.push(new mongoose.Types.ObjectId(conductorId));
  }

  const tickets = await TicketBooking.find({
    issuedByRole: "CONDUCTOR",
    issuedById: { $in: issuedByIdFilters },
    status: "PAID",
    $or: [
      { bookedAt: { $gte: start, $lt: end } },
      { bookedAt: null, createdAt: { $gte: start, $lt: end } },
    ],
  })
    .sort({ bookedAt: -1 })
    .select(
      "bookingId tripInstanceId routeId busNumber source destination fare passengerCount paymentMode bookedAt createdAt"
    )
    .lean();

  if (!tickets.length) {
    return res.json({ ok: true, date, trips: [] });
  }

  const tripIds = Array.from(
    new Set(
      tickets
        .map((ticket) => String(ticket.tripInstanceId || "").trim())
        .filter(Boolean)
    )
  );
  const tripDocs = tripIds.length
    ? await TripInstance.find({ _id: { $in: tripIds } })
        .populate("routeId", "routeCode routeName source destination")
        .populate("busId", "busNumber")
        .select("startTime endTime direction routeId busId status")
        .lean()
    : [];
  const tripById = new Map(tripDocs.map((trip) => [String(trip._id), trip]));
  const routeIds = Array.from(
    new Set(
      tickets
        .map((ticket) => String(ticket.routeId || "").trim())
        .filter(Boolean)
    )
  );
  const routeDocs = routeIds.length
    ? await Route.find({ _id: { $in: routeIds } })
        .select("routeCode routeName source destination")
        .lean()
    : [];
  const routeById = new Map(routeDocs.map((route) => [String(route._id), route]));

  const groups = new Map();
  for (const ticket of tickets) {
    const tripId = String(ticket.tripInstanceId || "UNMAPPED");
    const trip = tripById.get(String(ticket.tripInstanceId || "")) || null;
    const route = trip?.routeId || routeById.get(String(ticket.routeId || "")) || null;
    const tripKey = tripId;
    const fallbackRouteName =
      route?.routeName ||
      [ticket.source, ticket.destination].filter(Boolean).join(" - ") ||
      "Route";

    if (!groups.has(tripKey)) {
      groups.set(tripKey, {
        tripInstanceId: tripId === "UNMAPPED" ? null : tripId,
        route: {
          routeCode: route?.routeCode || "Route",
          routeName: fallbackRouteName,
          source: route?.source || ticket.source || "--",
          destination: route?.destination || ticket.destination || "--",
        },
        timing: {
          startTime: trip?.startTime || "--",
          endTime: trip?.endTime || "--",
        },
        direction: trip?.direction || "--",
        busNumber: trip?.busId?.busNumber || ticket.busNumber || "--",
        tripStatus: trip?.status || "--",
        fareCollected: 0,
        ticketsCount: 0,
        passengerCount: 0,
        tickets: [],
      });
    }

    const bucket = groups.get(tripKey);
    const pax = Number(ticket.passengerCount);
    const fare = Number(ticket.fare);
    bucket.ticketsCount += 1;
    bucket.passengerCount += Number.isFinite(pax) && pax > 0 ? pax : 1;
    bucket.fareCollected += Number.isFinite(fare) ? fare : 0;
    bucket.tickets.push({
      bookingId: ticket.bookingId,
      source: ticket.source,
      destination: ticket.destination,
      fare: Number.isFinite(fare) ? Number(fare.toFixed(2)) : 0,
      passengerCount: Number.isFinite(pax) && pax > 0 ? pax : 1,
      paymentMode: ticket.paymentMode || "CASH",
      bookedAt: ticket.bookedAt || ticket.createdAt || null,
    });
  }

  const trips = Array.from(groups.values()).map((item) => ({
    ...item,
    fareCollected: Number(item.fareCollected.toFixed(2)),
  }));

  res.json({ ok: true, date, trips });
});

exports.getConductorSummary = asyncHandler(async (req, res) => {
  const conductorId = req.user.userId;
  const date = String(req.query.date || today());

  const dayWindow = getOpsDayWindow(date);
  if (!dayWindow) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }
  const { start, end } = dayWindow;

  const issuedByIdFilters = [conductorId];
  if (mongoose.Types.ObjectId.isValid(conductorId)) {
    issuedByIdFilters.push(new mongoose.Types.ObjectId(conductorId));
  }

  const rows = await TicketBooking.aggregate([
    {
      $addFields: {
        effectiveBookedAt: { $ifNull: ["$bookedAt", "$createdAt"] },
      },
    },
    {
      $match: {
        issuedByRole: "CONDUCTOR",
        issuedById: { $in: issuedByIdFilters },
        status: "PAID",
        effectiveBookedAt: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: null,
        ticketsBooked: { $sum: { $ifNull: ["$passengerCount", 1] } },
        amountCollected: { $sum: { $ifNull: ["$fare", 0] } },
      },
    },
  ]);

  const summary = rows[0] || { ticketsBooked: 0, amountCollected: 0 };
  const ticketsBooked = Number(summary.ticketsBooked) || 0;
  const amountCollected = Number(summary.amountCollected) || 0;
  const avgTicketPrice = ticketsBooked > 0 ? Number((amountCollected / ticketsBooked).toFixed(2)) : 0;

  res.json({
    ok: true,
    date,
    summary: {
      ticketsBooked,
      amountCollected: Number(amountCollected.toFixed(2)),
      avgTicketPrice,
    },
  });
});
