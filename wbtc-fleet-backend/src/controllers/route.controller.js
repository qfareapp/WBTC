const Route = require("../models/Route");
const RouteStop = require("../models/RouteStop");
const FareSlab = require("../models/FareSlab");
const TripInstance = require("../models/TripInstance");
const Bus = require("../models/Bus");
const Depot = require("../models/Depot");
const RouteDayActivation = require("../models/RouteDayActivation");
const TicketBooking = require("../models/TicketBooking");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const validateSlabs = (slabs) => {
  const normalized = slabs
    .map((slab) => ({
      fromKm: Number(slab.fromKm),
      toKm: Number(slab.toKm),
      fare: Number(slab.fare),
    }))
    .sort((a, b) => a.fromKm - b.fromKm);

  for (const slab of normalized) {
    if (Number.isNaN(slab.fromKm) || Number.isNaN(slab.toKm) || Number.isNaN(slab.fare)) {
      throw new ApiError(400, "Fare slab values must be numeric");
    }
    if (slab.fromKm > slab.toKm) throw new ApiError(400, "Fare slab fromKm must be <= toKm");
  }

  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i].fromKm <= normalized[i - 1].toKm) {
      throw new ApiError(400, "Fare slabs cannot overlap");
    }
  }

  return normalized;
};

const toMinutes = (time) => {
  if (!time) return null;
  const [hh, mm] = time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
};

const fromMinutes = (mins) => {
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const buildOperatorFilter = (operatorType) => {
  if (!operatorType) return null;
  return operatorType === "WBTC"
    ? { $or: [{ operatorType: "WBTC" }, { operatorType: { $exists: false } }] }
    : { operatorType };
};

const normalizeDepotScope = (req) => {
  if (req.user.role === "ADMIN") return null;
  return req.user.depotId;
};

const toIsoDay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const toPct = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : 0);

const normalizeLocation = (value) => String(value || "").trim().toLowerCase();

const buildTimeline = (route, direction) => {
  if (!route) return [];
  const startTime = direction === "UP" ? route.firstTripTimeUp : route.firstTripTimeDown;
  const start = toMinutes(startTime);
  const end = toMinutes(route.lastTripTime);
  const duration = Number(route.standardTripTimeMin || 0);
  const frequency = Number(route.frequencyMin || 0);

  if (!start || !end || !duration || !frequency) return [];

  const trips = [];
  let time = start;
  while (time + duration <= end) {
    trips.push({
      startTime: fromMinutes(time),
      endTime: fromMinutes(time + duration),
      direction,
    });
    time += frequency;
  }
  return trips;
};

exports.createRouteWithFare = asyncHandler(async (req, res) => {
  const {
    routeNo,
    routeName,
    depotId,
    operatorType,
    estimatedTripDurationMin,
    frequencyMin,
    firstTripTimeUp,
    firstTripTimeDown,
    lastTripTime,
    assignmentMode,
    stops,
    fareSlabs,
  } = req.body;

  if (assignmentMode && !["MANUAL", "AUTO"].includes(assignmentMode)) {
    throw new ApiError(400, "assignmentMode must be MANUAL or AUTO");
  }

  if (!routeNo) throw new ApiError(400, "routeNo required");
  if (!routeName) throw new ApiError(400, "routeName required");
  if (!depotId) throw new ApiError(400, "depotId required");
  if (!Array.isArray(stops) || stops.length < 2) throw new ApiError(400, "At least 2 stops required");
  if (!Array.isArray(fareSlabs) || fareSlabs.length < 1) throw new ApiError(400, "Fare slabs required");

  const depot = await Depot.findById(depotId).select("operatorType");
  if (!depot) throw new ApiError(404, "Depot not found");
  const depotOperatorType = depot.operatorType || "WBTC";
  const finalOperatorType = operatorType || depotOperatorType;
  if (String(finalOperatorType) !== String(depotOperatorType)) {
    throw new ApiError(400, "Route operatorType must match selected depot operatorType");
  }
  const existingRoute = await Route.findOne({ routeCode: routeNo, operatorType: finalOperatorType });
  if (existingRoute) throw new ApiError(409, "Route number already exists in this operator panel");

  const sortedStops = stops
    .map((stop, idx) => ({ index: Number(stop.index ?? idx), name: stop.name }))
    .sort((a, b) => a.index - b.index);

  if (sortedStops.some((stop) => !stop.name)) throw new ApiError(400, "Stop name required");

  const normalizedSlabs = validateSlabs(fareSlabs);

  const source = sortedStops[0].name;
  const destination = sortedStops[sortedStops.length - 1].name;
  const distanceKm = Math.max(sortedStops.length - 1, 0);

  const route = await Route.create({
    routeCode: routeNo,
    routeName,
    depotId,
    operatorType: finalOperatorType,
    source,
    destination,
    distanceKm,
    standardTripTimeMin: Number(estimatedTripDurationMin) || 0,
    frequencyMin: Number(frequencyMin) || 0,
    firstTripTimeUp: firstTripTimeUp || null,
    firstTripTimeDown: firstTripTimeDown || null,
    lastTripTime: lastTripTime || null,
    assignmentMode: assignmentMode || "MANUAL",
    operational: true,
  });

  const stopDocs = await RouteStop.insertMany(
    sortedStops.map((stop) => ({
      routeId: route._id,
      index: stop.index,
      name: stop.name,
    }))
  );

  const slabDocs = await FareSlab.insertMany(
    normalizedSlabs.map((slab) => ({
      routeId: route._id,
      fromKm: slab.fromKm,
      toKm: slab.toKm,
      fare: slab.fare,
    }))
  );

  res.status(201).json({ ok: true, route, stops: stopDocs, fareSlabs: slabDocs });
});

exports.getRouteFare = asyncHandler(async (req, res) => {
  const route = await Route.findById(req.params.id);
  if (!route) throw new ApiError(404, "Route not found");

  const [stops, fareSlabs] = await Promise.all([
    RouteStop.find({ routeId: route._id }).sort({ index: 1 }),
    FareSlab.find({ routeId: route._id }).sort({ fromKm: 1 }),
  ]);

  res.json({ ok: true, route, stops, fareSlabs });
});

exports.listRoutes = asyncHandler(async (req, res) => {
  const query = {};
  if (req.query.depotId) query.depotId = req.query.depotId;
  if (req.query.assignmentMode) query.assignmentMode = req.query.assignmentMode;
  const operatorFilter = buildOperatorFilter(req.query.operatorType);
  if (operatorFilter) Object.assign(query, operatorFilter);
  const routes = await Route.find(query).populate("depotId", "depotName depotCode").sort({ routeCode: 1 });
  res.json({ ok: true, routes });
});

exports.updateRouteWithFare = asyncHandler(async (req, res) => {
  const {
    routeNo,
    routeName,
    depotId,
    operatorType,
    estimatedTripDurationMin,
    frequencyMin,
    firstTripTimeUp,
    firstTripTimeDown,
    lastTripTime,
    assignmentMode,
    stops,
    fareSlabs,
  } = req.body;

  if (assignmentMode && !["MANUAL", "AUTO"].includes(assignmentMode)) {
    throw new ApiError(400, "assignmentMode must be MANUAL or AUTO");
  }

  if (!routeNo) throw new ApiError(400, "routeNo required");
  if (!routeName) throw new ApiError(400, "routeName required");
  if (!depotId) throw new ApiError(400, "depotId required");
  if (!Array.isArray(stops) || stops.length < 2) throw new ApiError(400, "At least 2 stops required");
  if (!Array.isArray(fareSlabs) || fareSlabs.length < 1) throw new ApiError(400, "Fare slabs required");

  const route = await Route.findById(req.params.id);
  if (!route) throw new ApiError(404, "Route not found");
  const depot = await Depot.findById(depotId).select("operatorType");
  if (!depot) throw new ApiError(404, "Depot not found");
  const depotOperatorType = depot.operatorType || "WBTC";
  const finalOperatorType = operatorType || depotOperatorType;
  if (String(finalOperatorType) !== String(depotOperatorType)) {
    throw new ApiError(400, "Route operatorType must match selected depot operatorType");
  }

  const conflict = await Route.findOne({
    routeCode: routeNo,
    operatorType: finalOperatorType,
    _id: { $ne: route._id },
  });
  if (conflict) throw new ApiError(409, "Route number already exists in this operator panel");

  const sortedStops = stops
    .map((stop, idx) => ({ index: Number(stop.index ?? idx), name: stop.name }))
    .sort((a, b) => a.index - b.index);

  if (sortedStops.some((stop) => !stop.name)) throw new ApiError(400, "Stop name required");

  const normalizedSlabs = validateSlabs(fareSlabs);

  const source = sortedStops[0].name;
  const destination = sortedStops[sortedStops.length - 1].name;
  const distanceKm = Math.max(sortedStops.length - 1, 0);

  route.routeCode = routeNo;
  route.routeName = routeName;
  route.depotId = depotId;
  route.operatorType = finalOperatorType;
  route.source = source;
  route.destination = destination;
  route.distanceKm = distanceKm;
  route.standardTripTimeMin = Number(estimatedTripDurationMin) || 0;
  route.frequencyMin = Number(frequencyMin) || 0;
  route.firstTripTimeUp = firstTripTimeUp || null;
  route.firstTripTimeDown = firstTripTimeDown || null;
  route.lastTripTime = lastTripTime || null;
  if (assignmentMode) route.assignmentMode = assignmentMode;

  await route.save();

  await Promise.all([
    RouteStop.deleteMany({ routeId: route._id }),
    FareSlab.deleteMany({ routeId: route._id }),
  ]);

  const stopDocs = await RouteStop.insertMany(
    sortedStops.map((stop) => ({
      routeId: route._id,
      index: stop.index,
      name: stop.name,
    }))
  );

  const slabDocs = await FareSlab.insertMany(
    normalizedSlabs.map((slab) => ({
      routeId: route._id,
      fromKm: slab.fromKm,
      toKm: slab.toKm,
      fare: slab.fare,
    }))
  );

  res.json({ ok: true, route, stops: stopDocs, fareSlabs: slabDocs });
});

exports.updateAssignmentMode = asyncHandler(async (req, res) => {
  const { assignmentMode } = req.body;
  if (!["MANUAL", "AUTO"].includes(assignmentMode)) {
    throw new ApiError(400, "assignmentMode must be MANUAL or AUTO");
  }
  const route = await Route.findById(req.params.id);
  if (!route) throw new ApiError(404, "Route not found");

  route.assignmentMode = assignmentMode;
  await route.save();

  res.json({ ok: true, route });
});

exports.getRouteDayStatus = asyncHandler(async (req, res) => {
  const date = req.query.date;
  if (!date) throw new ApiError(400, "date required");
  const route = await Route.findById(req.params.id);
  if (!route) throw new ApiError(404, "Route not found");

  const activation = await RouteDayActivation.findOne({ date, routeId: route._id })
    .select("busIdsUp busIdsDown autoOffersEnabled deactivatedAt");

  res.json({
    ok: true,
    date,
    routeId: route._id,
    activated: Boolean(activation),
    autoOffersEnabled: activation ? activation.autoOffersEnabled !== false : false,
    deactivatedAt: activation?.deactivatedAt || null,
    busIdsUp: activation?.busIdsUp || [],
    busIdsDown: activation?.busIdsDown || [],
  });
});

exports.activateRouteDay = asyncHandler(async (req, res) => {
  const { date, busIdUp, busIdDown, busIdsUp = [], busIdsDown = [] } = req.body;
  if (!date) throw new ApiError(400, "date required");
  const normalizedUp = Array.from(
    new Set(
      (Array.isArray(busIdsUp) ? busIdsUp : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  const normalizedDown = Array.from(
    new Set(
      (Array.isArray(busIdsDown) ? busIdsDown : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

  if (busIdUp && !normalizedUp.includes(String(busIdUp))) normalizedUp.push(String(busIdUp));
  if (busIdDown && !normalizedDown.includes(String(busIdDown))) normalizedDown.push(String(busIdDown));

  const route = await Route.findById(req.params.id);
  if (!route) throw new ApiError(404, "Route not found");
  if (route.assignmentMode !== "AUTO") {
    throw new ApiError(400, "Route is not in AUTO mode");
  }

  if (normalizedUp.length === 0 && normalizedDown.length === 0) {
    const candidateBuses = await Bus.find({
      depotId: route.depotId,
      attachedRouteId: route._id,
      status: "Active",
    }).select("_id busNumber currentLocation");

    const sourceNorm = normalizeLocation(route.source);
    const destinationNorm = normalizeLocation(route.destination);

    for (const bus of candidateBuses) {
      const locationNorm = normalizeLocation(bus.currentLocation);
      if (!locationNorm) continue;
      if (locationNorm === sourceNorm) normalizedUp.push(String(bus._id));
      else if (locationNorm === destinationNorm) normalizedDown.push(String(bus._id));
    }
  }

  const [upTimeline, downTimeline] = [
    buildTimeline(route, "UP"),
    buildTimeline(route, "DOWN"),
  ];

  if (upTimeline.length === 0 && downTimeline.length === 0) {
    throw new ApiError(400, "Route schedule not configured");
  }

  const overlap = normalizedUp.filter((id) => normalizedDown.includes(id));
  if (overlap.length > 0) {
    throw new ApiError(400, "A bus can be assigned only once: UP or DOWN");
  }

  const finalBusIdsUp = normalizedUp;
  const finalBusIdsDown = normalizedDown;

  const allIds = Array.from(new Set([...finalBusIdsUp, ...finalBusIdsDown]));
  const buses = await Bus.find({ _id: { $in: allIds } });
  if (buses.length !== allIds.length) throw new ApiError(404, "One or more buses not found");
  if (buses.some((bus) => String(bus.depotId) !== String(route.depotId))) {
    throw new ApiError(400, "One or more buses do not belong to this depot");
  }
  const conflictingTrips = await TripInstance.find({
    date,
    busId: { $in: allIds },
    routeId: { $ne: route._id },
    releasedForReuse: { $ne: true },
  }).select("busId");
  if (conflictingTrips.length > 0) {
    const conflictBusIds = new Set(conflictingTrips.map((item) => String(item.busId)));
    const conflictBusNumbers = buses
      .filter((bus) => conflictBusIds.has(String(bus._id)))
      .map((bus) => bus.busNumber);
    throw new ApiError(
      409,
      `Bus already assigned to another route for ${date}: ${conflictBusNumbers.join(", ")}`
    );
  }

  await RouteDayActivation.findOneAndUpdate(
    { date, routeId: route._id },
    {
      date,
      routeId: route._id,
      depotId: route.depotId,
      busIdsUp: finalBusIdsUp,
      busIdsDown: finalBusIdsDown,
      autoOffersEnabled: true,
      deactivatedAt: null,
      deactivatedBy: null,
      createdBy: req.user?.userId || null,
    },
    { upsert: true, new: true }
  );

  const createOrUpdateTrip = async (trip, busId) => {
    const existing = await TripInstance.findOne({
      date,
      routeId: route._id,
      direction: trip.direction,
      startTime: trip.startTime,
    });

    if (!existing) {
      await TripInstance.create({
        date,
        depotId: route.depotId,
        routeId: route._id,
        busId,
        direction: trip.direction,
        startTime: trip.startTime,
        endTime: trip.endTime,
        status: "Scheduled",
        releasedForReuse: false,
      });
      return;
    }

    if (["Scheduled", "Cancelled"].includes(existing.status)) {
      existing.busId = busId;
      existing.endTime = trip.endTime;
      existing.status = "Scheduled";
      existing.releasedForReuse = false;
      await existing.save();
    }
  };

  for (let i = 0; i < upTimeline.length; i += 1) {
    if (!finalBusIdsUp.length) break;
    const trip = upTimeline[i];
    const busId = finalBusIdsUp[i % finalBusIdsUp.length];
    await createOrUpdateTrip(trip, busId);
  }
  for (let i = 0; i < downTimeline.length; i += 1) {
    if (!finalBusIdsDown.length) break;
    const trip = downTimeline[i];
    const busId = finalBusIdsDown[i % finalBusIdsDown.length];
    await createOrUpdateTrip(trip, busId);
  }

  res.json({
    ok: true,
    date,
    routeId: route._id,
    busIdsUp: finalBusIdsUp,
    busIdsDown: finalBusIdsDown,
    autoOffersEnabled: true,
    warnings: [
      ...(upTimeline.length > 0 && finalBusIdsUp.length === 0
        ? ["No eligible UP buses found. Route activated without UP trip allocation."]
        : []),
      ...(downTimeline.length > 0 && finalBusIdsDown.length === 0
        ? ["No eligible DOWN buses found. Route activated without DOWN trip allocation."]
        : []),
    ],
  });
});

exports.deactivateRouteDay = asyncHandler(async (req, res) => {
  const { date } = req.body;
  if (!date) throw new ApiError(400, "date required");
  const route = await Route.findById(req.params.id);
  if (!route) throw new ApiError(404, "Route not found");

  const activation = await RouteDayActivation.findOne({ date, routeId: route._id });
  if (!activation) throw new ApiError(404, "Route is not activated for this date");

  activation.autoOffersEnabled = false;
  activation.deactivatedAt = new Date();
  activation.deactivatedBy = req.user?.userId || null;
  await activation.save();

  res.json({
    ok: true,
    date,
    routeId: route._id,
    autoOffersEnabled: false,
    deactivatedAt: activation.deactivatedAt,
  });
});

exports.releaseRouteBusForDate = asyncHandler(async (req, res) => {
  const { date, busId } = req.body;
  if (!date) throw new ApiError(400, "date required");
  if (!busId) throw new ApiError(400, "busId required");

  const route = await Route.findById(req.params.id);
  if (!route) throw new ApiError(404, "Route not found");

  const bus = await Bus.findById(busId).select("busNumber depotId");
  if (!bus) throw new ApiError(404, "Bus not found");
  if (String(bus.depotId) !== String(route.depotId)) {
    throw new ApiError(400, "Bus does not belong to this route depot");
  }

  const activeTrip = await TripInstance.findOne({
    date,
    routeId: route._id,
    busId,
    status: "Active",
    releasedForReuse: { $ne: true },
  }).select("_id");
  if (activeTrip) {
    throw new ApiError(409, "Cannot release bus while an active trip is running");
  }

  const releaseResult = await TripInstance.updateMany(
    {
      date,
      routeId: route._id,
      busId,
      releasedForReuse: { $ne: true },
    },
    {
      $set: { releasedForReuse: true },
    }
  );

  await TripInstance.updateMany(
    {
      date,
      routeId: route._id,
      busId,
      status: "Scheduled",
    },
    {
      $set: { status: "Cancelled", releasedForReuse: true },
    }
  );

  await RouteDayActivation.findOneAndUpdate(
    { date, routeId: route._id },
    {
      $pull: { busIdsUp: busId, busIdsDown: busId },
    }
  );

  if (!releaseResult.matchedCount) {
    throw new ApiError(404, `No assignments found for ${bus.busNumber} on ${date} in this route`);
  }

  res.json({
    ok: true,
    date,
    routeId: route._id,
    busId,
    busNumber: bus.busNumber,
    releasedTrips: releaseResult.modifiedCount,
  });
});

exports.getRoutePerformance = asyncHandler(async (req, res) => {
  const mode = String(req.query.mode || "daily").toLowerCase();
  const operatorType = req.query.operatorType ? String(req.query.operatorType).toUpperCase() : null;
  const requestedDepotId = req.query.depotId || null;
  const scopeDepotId = normalizeDepotScope(req);
  const depotId = scopeDepotId || requestedDepotId || null;

  const now = new Date();
  let periodStart;
  let periodEnd;

  if (mode === "daily") {
    const date = req.query.date || now.toISOString().slice(0, 10);
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) throw new ApiError(400, "Invalid date. Use YYYY-MM-DD");
    periodStart = start;
    periodEnd = new Date(start);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
  } else if (mode === "monthly") {
    const month = String(req.query.month || now.toISOString().slice(0, 7));
    const start = new Date(`${month}-01T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) throw new ApiError(400, "Invalid month. Use YYYY-MM");
    periodStart = start;
    periodEnd = new Date(start);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  } else if (mode === "custom") {
    const start = new Date(`${String(req.query.startDate || "")}T00:00:00.000Z`);
    const end = new Date(`${String(req.query.endDate || "")}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ApiError(400, "Invalid startDate/endDate. Use YYYY-MM-DD");
    }
    if (start > end) throw new ApiError(400, "startDate must be <= endDate");
    periodStart = start;
    periodEnd = new Date(end);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
  } else {
    throw new ApiError(400, "mode must be daily, monthly, or custom");
  }

  const operatorFilter = buildOperatorFilter(operatorType);
  const routeQuery = {};
  if (depotId) routeQuery.depotId = depotId;
  if (operatorFilter) Object.assign(routeQuery, operatorFilter);

  const routes = await Route.find(routeQuery).select("_id routeCode routeName");
  if (!routes.length) {
    return res.json({
      ok: true,
      mode,
      operatorType: operatorType || null,
      depotId,
      period: {
        startDate: toIsoDay(periodStart),
        endDate: toIsoDay(new Date(periodEnd.getTime() - 1)),
      },
      summary: {
        totalRoutes: 0,
        totalTickets: 0,
        totalSalesAmount: 0,
        avgTicketPrice: 0,
        totalTrips: 0,
        completedTrips: 0,
        completionRatePct: 0,
        avgTicketsPerTrip: 0,
        avgRevenuePerTrip: 0,
      },
      routes: [],
    });
  }

  const routeIds = routes.map((item) => item._id);
  const routeIdStrings = routes.map((item) => String(item._id));

  const [bookingRows, tripRows] = await Promise.all([
    TicketBooking.aggregate([
      {
        $match: {
          status: "PAID",
          routeId: { $in: routeIdStrings },
          bookedAt: { $gte: periodStart, $lt: periodEnd },
        },
      },
      {
        $group: {
          _id: "$routeId",
          ticketsGenerated: { $sum: { $ifNull: ["$passengerCount", 1] } },
          salesAmount: { $sum: { $ifNull: ["$fare", 0] } },
          bookingsCount: { $sum: 1 },
        },
      },
    ]),
    TripInstance.aggregate([
      {
        $match: {
          routeId: { $in: routeIds },
          date: {
            $gte: toIsoDay(periodStart),
            $lte: toIsoDay(new Date(periodEnd.getTime() - 1)),
          },
        },
      },
      {
        $group: {
          _id: {
            routeId: "$routeId",
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const bookingByRoute = bookingRows.reduce((acc, row) => {
    acc[String(row._id)] = {
      ticketsGenerated: Number(row.ticketsGenerated || 0),
      salesAmount: Number(row.salesAmount || 0),
      bookingsCount: Number(row.bookingsCount || 0),
    };
    return acc;
  }, {});

  const tripByRoute = {};
  for (const row of tripRows) {
    const routeIdKey = String(row._id.routeId);
    const status = String(row._id.status || "");
    if (!tripByRoute[routeIdKey]) {
      tripByRoute[routeIdKey] = {
        scheduled: 0,
        active: 0,
        completed: 0,
        cancelled: 0,
      };
    }
    if (status === "Scheduled") tripByRoute[routeIdKey].scheduled += row.count;
    if (status === "Active") tripByRoute[routeIdKey].active += row.count;
    if (status === "Completed") tripByRoute[routeIdKey].completed += row.count;
    if (status === "Cancelled") tripByRoute[routeIdKey].cancelled += row.count;
  }

  const routeRows = routes.map((route) => {
    const key = String(route._id);
    const booking = bookingByRoute[key] || { ticketsGenerated: 0, salesAmount: 0, bookingsCount: 0 };
    const trip = tripByRoute[key] || { scheduled: 0, active: 0, completed: 0, cancelled: 0 };
    const tripsTotal = trip.scheduled + trip.active + trip.completed + trip.cancelled;
    const avgTicketPrice = booking.ticketsGenerated > 0 ? booking.salesAmount / booking.ticketsGenerated : 0;
    const ticketsPerTrip = tripsTotal > 0 ? booking.ticketsGenerated / tripsTotal : 0;
    const revenuePerTrip = tripsTotal > 0 ? booking.salesAmount / tripsTotal : 0;
    const completionRatePct = toPct(trip.completed, tripsTotal);

    return {
      routeId: route._id,
      routeCode: route.routeCode,
      routeName: route.routeName,
      ticketsGenerated: booking.ticketsGenerated,
      salesAmount: Number(booking.salesAmount.toFixed(2)),
      avgTicketPrice: Number(avgTicketPrice.toFixed(2)),
      tripsTotal,
      tripsScheduled: trip.scheduled,
      tripsActive: trip.active,
      tripsCompleted: trip.completed,
      tripsCancelled: trip.cancelled,
      completionRatePct,
      ticketsPerTrip: Number(ticketsPerTrip.toFixed(2)),
      revenuePerTrip: Number(revenuePerTrip.toFixed(2)),
    };
  });

  routeRows.sort((a, b) => b.salesAmount - a.salesAmount);

  const totals = routeRows.reduce(
    (acc, row) => {
      acc.totalTickets += row.ticketsGenerated;
      acc.totalSalesAmount += row.salesAmount;
      acc.totalTrips += row.tripsTotal;
      acc.completedTrips += row.tripsCompleted;
      return acc;
    },
    { totalTickets: 0, totalSalesAmount: 0, totalTrips: 0, completedTrips: 0 }
  );

  const avgTicketPrice = totals.totalTickets > 0 ? totals.totalSalesAmount / totals.totalTickets : 0;
  const avgTicketsPerTrip = totals.totalTrips > 0 ? totals.totalTickets / totals.totalTrips : 0;
  const avgRevenuePerTrip = totals.totalTrips > 0 ? totals.totalSalesAmount / totals.totalTrips : 0;

  res.json({
    ok: true,
    mode,
    operatorType: operatorType || null,
    depotId,
    period: {
      startDate: toIsoDay(periodStart),
      endDate: toIsoDay(new Date(periodEnd.getTime() - 1)),
    },
    summary: {
      totalRoutes: routeRows.length,
      totalTickets: totals.totalTickets,
      totalSalesAmount: Number(totals.totalSalesAmount.toFixed(2)),
      avgTicketPrice: Number(avgTicketPrice.toFixed(2)),
      totalTrips: totals.totalTrips,
      completedTrips: totals.completedTrips,
      completionRatePct: toPct(totals.completedTrips, totals.totalTrips),
      avgTicketsPerTrip: Number(avgTicketsPerTrip.toFixed(2)),
      avgRevenuePerTrip: Number(avgRevenuePerTrip.toFixed(2)),
    },
    routes: routeRows,
  });
});
