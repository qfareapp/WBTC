const TripInstance = require("../models/TripInstance");
const DriverAssignment = require("../models/DriverAssignment");
const Route = require("../models/Route");
const Bus = require("../models/Bus");
const Driver = require("../models/Driver");
const TicketBooking = require("../models/TicketBooking");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { ensureDriverEligibleForBus } = require("../utils/crewPolicy");

const normalizeDepotScope = (req) => {
  if (req.user.role === "ADMIN") return null;
  return req.user.depotId;
};

const buildOperatorFilter = (operatorType) => {
  if (!operatorType) return null;
  return operatorType === "WBTC"
    ? { $or: [{ operatorType: "WBTC" }, { operatorType: { $exists: false } }] }
    : { operatorType };
};

const toMinutes = (time) => {
  if (!time || typeof time !== "string") return null;
  const [hh, mm] = time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
};

const toClockMinutes = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
};

const addMinutes = (time, minutes) => {
  const [hh, mm] = time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return time;
  const total = hh * 60 + mm + minutes;
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const mins = String(total % 60).padStart(2, "0");
  return `${hours}:${mins}`;
};

const getStartLocation = (route, direction) => {
  if (!route || !route.source || !route.destination) return null;
  return direction === "UP" ? route.source : route.destination;
};

const getEndLocation = (route, direction) => {
  if (!route || !route.source || !route.destination) return null;
  return direction === "UP" ? route.destination : route.source;
};

exports.listTrips = asyncHandler(async (req, res) => {
  const { routeId, date } = req.query;
  if (!routeId || !date) throw new ApiError(400, "routeId and date required");

  const trips = await TripInstance.find({ routeId, date })
    .populate("busId", "busNumber")
    .sort({ startTime: 1 });

  const assignmentMap = await DriverAssignment.find({ tripInstanceId: { $in: trips.map((t) => t._id) } })
    .populate("driverId", "name empId")
    .lean();

  const assignmentByTrip = assignmentMap.reduce((acc, assignment) => {
    acc[String(assignment.tripInstanceId)] = assignment;
    return acc;
  }, {});

  const enriched = trips.map((trip) => {
    const assignment = assignmentByTrip[String(trip._id)] || null;
    return {
      ...trip.toObject(),
      assignment,
    };
  });

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.json({ ok: true, trips: enriched });
});

exports.getLiveTrips = asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { depotId } = req.query;
  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId || null;

  const filter = { date, status: "Active" };
  if (finalDepotId) filter.depotId = finalDepotId;

  const trips = await TripInstance.find(filter)
    .populate("routeId", "routeCode routeName source destination depotId")
    .populate("busId", "busNumber busType currentLocation")
    .sort({ startTime: 1 })
    .lean();

  const tripIds = trips.map((trip) => trip._id);
  const assignments = await DriverAssignment.find({ tripInstanceId: { $in: tripIds } })
    .populate("driverId", "name empId")
    .lean();
  const assignmentByTrip = assignments.reduce((acc, item) => {
    acc[String(item.tripInstanceId)] = item;
    return acc;
  }, {});

  const routeMap = new Map();
  for (const trip of trips) {
    const route = trip.routeId || {};
    const routeKey = String(route._id || trip.routeId || "unknown");
    if (!routeMap.has(routeKey)) {
      routeMap.set(routeKey, {
        routeId: route._id || null,
        routeCode: route.routeCode || "--",
        routeName: route.routeName || "Route",
        source: route.source || null,
        destination: route.destination || null,
        tripCount: 0,
        trips: [],
      });
    }
    const group = routeMap.get(routeKey);
    const assignment = assignmentByTrip[String(trip._id)] || null;
    group.tripCount += 1;
    group.trips.push({
      tripInstanceId: trip._id,
      direction: trip.direction || null,
      startTime: trip.startTime || null,
      endTime: trip.endTime || null,
      actualStartTime: trip.actualStartTime || null,
      actualEndTime: trip.actualEndTime || null,
      actualDurationMin: trip.actualDurationMin ?? null,
      openingKm: trip.openingKm ?? null,
      closingKm: trip.closingKm ?? null,
      bus: trip.busId
        ? {
            id: trip.busId._id,
            busNumber: trip.busId.busNumber,
            busType: trip.busId.busType,
            currentLocation: trip.busId.currentLocation || null,
          }
        : null,
      driver: assignment?.driverId
        ? {
            id: assignment.driverId._id,
            name: assignment.driverId.name,
            empId: assignment.driverId.empId,
          }
        : null,
      location: {
        latitude: trip.lastLatitude ?? null,
        longitude: trip.lastLongitude ?? null,
        at: trip.lastLocationAt || null,
      },
    });
  }

  const routes = Array.from(routeMap.values()).sort((a, b) =>
    String(a.routeCode || "").localeCompare(String(b.routeCode || ""))
  );

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.json({
    ok: true,
    date,
    depotId: finalDepotId,
    totalLiveTrips: trips.length,
    totalRoutes: routes.length,
    routes,
  });
});

exports.getOtpSummary = asyncHandler(async (req, res) => {
  const { date, depotId, operatorType } = req.query;
  const windowMinRaw = Number(req.query.windowMin);
  const windowMin = Number.isFinite(windowMinRaw) ? Math.max(0, windowMinRaw) : 10;

  if (!date) throw new ApiError(400, "date required");

  const scopeDepotId = normalizeDepotScope(req);
  const filter = { date };
  if (scopeDepotId) {
    filter.depotId = scopeDepotId;
  } else if (depotId) {
    filter.depotId = depotId;
  }

  const operatorFilter = buildOperatorFilter(operatorType);
  let scopedBusIds = null;
  if (operatorFilter) {
    const busRows = await Bus.find({
      ...(filter.depotId ? { depotId: filter.depotId } : {}),
      ...operatorFilter,
    }).select("_id");
    scopedBusIds = busRows.map((row) => row._id);
    filter.busId = { $in: scopedBusIds };
  }

  const trips = await TripInstance.find(filter).select(
    "startTime endTime actualStartTime actualEndTime status"
  );
  const busFilter = {};
  if (filter.depotId) busFilter.depotId = filter.depotId;
  if (operatorFilter) Object.assign(busFilter, operatorFilter);
  const [totalFleet, activeFleet] = await Promise.all([
    Bus.countDocuments(busFilter),
    Bus.countDocuments({ ...busFilter, status: "Active" }),
  ]);

  let departureEligible = 0;
  let departureOnTime = 0;
  let arrivalEligible = 0;
  let arrivalOnTime = 0;
  let overallEligible = 0;
  let overallOnTime = 0;

  for (const trip of trips) {
    const scheduledStartMin = toMinutes(trip.startTime);
    const scheduledEndMin = toMinutes(trip.endTime);
    const actualStartMin = toClockMinutes(trip.actualStartTime);
    const actualEndMin = toClockMinutes(trip.actualEndTime);

    const hasDeparture = scheduledStartMin !== null && actualStartMin !== null;
    const hasArrival = scheduledEndMin !== null && actualEndMin !== null;

    const departureDelayMin = hasDeparture ? Math.abs(actualStartMin - scheduledStartMin) : null;
    const arrivalDelayMin = hasArrival ? Math.abs(actualEndMin - scheduledEndMin) : null;

    const departureWithinWindow = hasDeparture && departureDelayMin <= windowMin;
    const arrivalWithinWindow = hasArrival && arrivalDelayMin <= windowMin;

    if (hasDeparture) {
      departureEligible += 1;
      if (departureWithinWindow) departureOnTime += 1;
    }

    if (hasArrival) {
      arrivalEligible += 1;
      if (arrivalWithinWindow) arrivalOnTime += 1;
    }

    if (hasDeparture && hasArrival) {
      overallEligible += 1;
      if (departureWithinWindow && arrivalWithinWindow) overallOnTime += 1;
    }
  }

  const toPercent = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : 0);
  const completedTrips = trips.filter((trip) => trip.status === "Completed").length;
  const plannedTrips = trips.length;
  const skippedTrips = Math.max(0, plannedTrips - completedTrips);

  res.json({
    ok: true,
    date,
    depotId: filter.depotId || null,
    operatorType: operatorType || null,
    windowMin,
    totalTrips: plannedTrips,
    completedTrips,
    completion: {
      plannedTrips,
      executedTrips: completedTrips,
      skippedTrips,
      completionRatePct: toPercent(completedTrips, plannedTrips),
    },
    fleet: {
      totalFleet,
      activeBuses: activeFleet,
      utilizationPct: toPercent(activeFleet, totalFleet),
    },
    overall: {
      eligibleTrips: overallEligible,
      onTimeTrips: overallOnTime,
      otpPct: toPercent(overallOnTime, overallEligible),
    },
    departure: {
      eligibleTrips: departureEligible,
      onTimeTrips: departureOnTime,
      otpPct: toPercent(departureOnTime, departureEligible),
    },
    arrival: {
      eligibleTrips: arrivalEligible,
      onTimeTrips: arrivalOnTime,
      otpPct: toPercent(arrivalOnTime, arrivalEligible),
    },
  });
});

exports.getTodaySummary = asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { depotId, operatorType } = req.query;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId || null;
  const operatorFilter = buildOperatorFilter(operatorType);

  const busFilter = {};
  const driverFilter = {};
  const assignmentFilter = { date };

  if (finalDepotId) {
    busFilter.depotId = finalDepotId;
    driverFilter.depotId = finalDepotId;
    assignmentFilter.depotId = finalDepotId;
  }
  if (operatorFilter) {
    Object.assign(busFilter, operatorFilter);
    Object.assign(driverFilter, operatorFilter);
  }

  let scopedBusIds = null;
  let scopedBusNumbers = null;
  if (operatorFilter) {
    const scopedBuses = await Bus.find({
      ...(finalDepotId ? { depotId: finalDepotId } : {}),
      ...operatorFilter,
    }).select("_id busNumber");
    scopedBusIds = scopedBuses.map((row) => row._id);
    scopedBusNumbers = scopedBuses.map((row) => row.busNumber);
  }

  const [totalBuses, activeBuses, breakdownBuses, totalDrivers, onDutyDriverIds] = await Promise.all([
    Bus.countDocuments(busFilter),
    Bus.countDocuments({ ...busFilter, status: "Active" }),
    Bus.countDocuments({ ...busFilter, status: "Breakdown" }),
    Driver.countDocuments(driverFilter),
    DriverAssignment.distinct("driverId", assignmentFilter),
  ]);

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const now = new Date();
  const bookingWindowEnd = now < dayEnd ? now : dayEnd;
  const passengerAgg = await TicketBooking.aggregate([
    {
      $match: {
        status: "PAID",
        bookedAt: { $gte: dayStart, $lte: bookingWindowEnd },
        ...(finalDepotId ? { depotId: finalDepotId } : {}),
        ...(operatorFilter ? { busNumber: { $in: scopedBusNumbers || [] } } : {}),
      },
    },
    {
      $group: {
        _id: null,
        totalPassengers: { $sum: { $ifNull: ["$passengerCount", 1] } },
      },
    },
  ]);
  const passengersToday = passengerAgg[0]?.totalPassengers || 0;
  const kmAgg = await TripInstance.aggregate([
    {
      $match: {
        date,
        status: "Completed",
        openingKm: { $ne: null },
        closingKm: { $ne: null },
        ...(finalDepotId ? { depotId: finalDepotId } : {}),
        ...(operatorFilter ? { busId: { $in: scopedBusIds || [] } } : {}),
      },
    },
    {
      $group: {
        _id: null,
        totalKm: {
          $sum: {
            $max: [0, { $subtract: ["$closingKm", "$openingKm"] }],
          },
        },
      },
    },
  ]);
  const totalKmCoveredToday = Number((kmAgg[0]?.totalKm || 0).toFixed(1));
  const tripStatusRows = await TripInstance.aggregate([
    {
      $match: {
        date,
        ...(finalDepotId ? { depotId: finalDepotId } : {}),
        ...(operatorFilter ? { busId: { $in: scopedBusIds || [] } } : {}),
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const tripCounts = tripStatusRows.reduce(
    (acc, item) => {
      if (item._id === "Active") acc.live = item.count;
      if (item._id === "Scheduled") acc.scheduled = item.count;
      if (item._id === "Completed") acc.completed = item.count;
      if (item._id === "Cancelled") acc.cancelled = item.count;
      acc.total += item.count;
      return acc;
    },
    { live: 0, scheduled: 0, completed: 0, cancelled: 0, total: 0 }
  );

  res.json({
    ok: true,
    date,
    depotId: finalDepotId,
    operatorType: operatorType || null,
    buses: {
      total: totalBuses,
      active: activeBuses,
      breakdown: breakdownBuses,
    },
    drivers: {
      total: totalDrivers,
      onDuty: onDutyDriverIds.length,
    },
    trips: tripCounts,
    passengersToday,
    totalKmCoveredToday,
  });
});

exports.activateTrip = asyncHandler(async (req, res) => {
  const {
    date,
    depotId,
    routeId,
    busId,
    driverId,
    direction,
    startTime,
    endTime,
  } = req.body;

  if (!date || !depotId || !routeId || !busId || !driverId) throw new ApiError(400, "Missing required fields");
  if (!direction || !startTime || !endTime) throw new ApiError(400, "direction, startTime, endTime required");

  const route = await Route.findById(routeId);
  if (!route) throw new ApiError(404, "Route not found");
  if (String(route.depotId) !== String(depotId)) throw new ApiError(400, "Route not in this depot");
  const conflictRouteTrip = await TripInstance.findOne({
    date,
    busId,
    routeId: { $ne: routeId },
    releasedForReuse: { $ne: true },
  })
    .populate("routeId", "routeCode")
    .select("routeId");
  if (conflictRouteTrip) {
    const conflictRouteCode = conflictRouteTrip.routeId?.routeCode || "another route";
    throw new ApiError(409, `Bus already assigned to ${conflictRouteCode} for ${date}`);
  }

  const busActive = await DriverAssignment.findOne({ date, busId, status: "Active" });
  if (busActive) throw new ApiError(409, "Bus already assigned to an active trip");

  const driverActive = await DriverAssignment.findOne({ date, driverId, status: "Active" });
  if (driverActive) throw new ApiError(409, "Driver already assigned to an active trip");

  const [bus, driver] = await Promise.all([
    Bus.findById(busId),
    Driver.findById(driverId),
  ]);

  if (!bus) throw new ApiError(404, "Bus not found");
  if (!driver) throw new ApiError(404, "Driver not found");
  if (driver.status && driver.status !== "Available") {
    throw new ApiError(409, "Driver not available for assignment");
  }

  const eligibility = await ensureDriverEligibleForBus({ busId, driverId, date });
  if (!eligibility.ok) {
    throw new ApiError(409, eligibility.reason);
  }

  const startLocation = getStartLocation(route, direction);
  if (startLocation) {
    if (bus.currentLocation && bus.currentLocation !== startLocation) {
      throw new ApiError(409, `Bus not available at ${startLocation}`);
    }
    if (driver.currentLocation && driver.currentLocation !== startLocation) {
      throw new ApiError(409, `Driver not available at ${startLocation}`);
    }
  }

  let trip = await TripInstance.findOne({ date, routeId, direction, startTime });
  if (!trip) {
    trip = await TripInstance.create({
      date,
      depotId,
      routeId,
      busId,
      direction,
      startTime,
      endTime,
      status: "Active",
      releasedForReuse: false,
    });
  } else {
    trip.busId = busId;
    trip.endTime = endTime;
    trip.status = "Active";
    trip.releasedForReuse = false;
    await trip.save();
  }

  let assignment = await DriverAssignment.findOne({ tripInstanceId: trip._id });
  if (!assignment) {
    assignment = await DriverAssignment.create({
      date,
      depotId,
      busId,
      driverId,
      routeId,
      tripTemplateId: trip._id,
      tripInstanceId: trip._id,
      startTime,
      endTime,
      restUntilTime: addMinutes(endTime, 30),
      assignedBy: req.user.userId,
      status: "Active",
    });
  } else {
    assignment.busId = busId;
    assignment.driverId = driverId;
    assignment.startTime = startTime;
    assignment.endTime = endTime;
    assignment.restUntilTime = addMinutes(endTime, 30);
    assignment.status = "Active";
    await assignment.save();
  }

  res.json({ ok: true, trip, assignment });
});

exports.completeTrip = asyncHandler(async (req, res) => {
  const { tripInstanceId } = req.body;
  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");

  const trip = await TripInstance.findById(tripInstanceId);
  if (!trip) throw new ApiError(404, "Trip not found");

  const route = await Route.findById(trip.routeId);
  const assignment = await DriverAssignment.findOne({ tripInstanceId: trip._id });

  const completedAt = new Date();
  trip.status = "Completed";
  trip.actualEndTime = completedAt;
  if (trip.actualStartTime) {
    trip.actualDurationMin = Math.max(
      0,
      Math.round((completedAt.getTime() - trip.actualStartTime.getTime()) / 60000)
    );
  }
  await trip.save();

  await DriverAssignment.updateMany(
    { tripInstanceId: trip._id },
    { $set: { status: "Completed" } }
  );

  const endLocation = getEndLocation(route, trip.direction);
  if (endLocation) {
    const updates = [];
    if (trip.busId) {
      const busSet = { currentLocation: endLocation };
      if (typeof trip.closingKm === "number") {
        busSet.lastOdometerKm = trip.closingKm;
      }
      updates.push(Bus.findByIdAndUpdate(trip.busId, { $set: busSet }));
    }
    if (assignment && assignment.driverId) {
      updates.push(Driver.findByIdAndUpdate(assignment.driverId, { $set: { currentLocation: endLocation } }));
    }
    if (updates.length) await Promise.all(updates);
  } else if (trip.busId && typeof trip.closingKm === "number") {
    await Bus.findByIdAndUpdate(trip.busId, { $set: { lastOdometerKm: trip.closingKm } });
  }

  res.json({ ok: true, trip });
});
