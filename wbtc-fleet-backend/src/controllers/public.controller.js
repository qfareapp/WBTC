const Bus = require("../models/Bus");
const TripInstance = require("../models/TripInstance");
const Route = require("../models/Route");
const RouteStop = require("../models/RouteStop");
const FareSlab = require("../models/FareSlab");
const TicketBooking = require("../models/TicketBooking");
const StopGeocode = require("../models/StopGeocode");
const PassengerWaitRequest = require("../models/PassengerWaitRequest");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { OPS_TIMEZONE, getOpsDate, toOpsIsoDay, toOpsMonthKey, getOpsDayWindow } = require("../utils/opsTime");
const { forwardGeocode } = require("../utils/nominatim");
const { getDrivingEta } = require("../utils/openrouteservice");
const {
  getCanonicalStopForTrip,
  getPassengerWaitingStatus,
  getTripWaitingSnapshot,
  normalizeStopName,
} = require("../utils/passengerWaiting");

const normalizeBusNumber = (value) => String(value || "").trim();

/**
 * Returns the best available bus location for a trip.
 * Prefer conductor GPS and fall back to driver GPS when needed.
 */
const resolveBestLocation = (trip) => {
  if (typeof trip.lastLatitude === "number" && typeof trip.lastLongitude === "number") {
    return {
      lat: trip.lastLatitude,
      lng: trip.lastLongitude,
      at: trip.lastLocationAt,
      name: trip.lastLocationName || null,
    };
  }
  if (typeof trip.driverLastLatitude === "number" && typeof trip.driverLastLongitude === "number") {
    return {
      lat: trip.driverLastLatitude,
      lng: trip.driverLastLongitude,
      at: trip.driverLastLocationAt,
      name: trip.lastLocationName || null,
    };
  }
  return null;
};

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const addUtcMonths = (date, months) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

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

const findLiveTripForBus = async (busId, date) => {
  const query = {
    busId,
    status: "Active",
    date: String(date || getOpsDate()),
  };
  return TripInstance.findOne(query)
    .sort({ actualStartTime: -1, updatedAt: -1 })
    .populate("routeId", "routeCode routeName source destination");
};

exports.getBusRouteByQr = asyncHandler(async (req, res) => {
  const busNumber = normalizeBusNumber(req.query.busNumber);
  const depotId = req.query.depotId ? String(req.query.depotId) : null;
  const date = req.query.date ? String(req.query.date) : null;

  if (!busNumber) throw new ApiError(400, "busNumber required");

  const bus = await Bus.findOne({ busNumber });
  if (!bus) throw new ApiError(404, "Bus not found");
  if (depotId && String(bus.depotId) !== depotId) throw new ApiError(400, "Bus not in depot");
  if (bus.status !== "Active") {
    throw new ApiError(409, "This bus is not active right now.");
  }

  const liveTrip = await findLiveTripForBus(bus._id, date);
  if (!liveTrip || !liveTrip.routeId) {
    throw new ApiError(409, "This bus is not active right now.");
  }

  const route = liveTrip.routeId;
  const [stops, fareSlabs] = await Promise.all([
    RouteStop.find({ routeId: route._id }).sort({ index: 1 }),
    FareSlab.find({ routeId: route._id }).sort({ fromKm: 1 }),
  ]);

  res.json({
    ok: true,
    bus: {
      id: bus._id,
      busNumber: bus.busNumber,
      busType: bus.busType,
      depotId: bus.depotId,
    },
    route: {
      id: route._id,
      routeCode: route.routeCode,
      routeName: route.routeName,
      source: route.source,
      destination: route.destination,
    },
    stops,
    fareSlabs,
  });
});

exports.listPublicRoutes = asyncHandler(async (req, res) => {
  const routes = await Route.find().sort({ routeCode: 1 }).lean();
  if (!routes.length) {
    res.json({ ok: true, routes: [] });
    return;
  }

  const stops = await RouteStop.find({ routeId: { $in: routes.map((r) => r._id) } })
    .sort({ index: 1 })
    .lean();

  const stopsByRoute = stops.reduce((acc, stop) => {
    const key = String(stop.routeId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(stop);
    return acc;
  }, {});

  const payload = routes.map((route) => ({
    id: route._id,
    routeCode: route.routeCode,
    routeName: route.routeName,
    source: route.source,
    destination: route.destination,
    standardTripTimeMin: route.standardTripTimeMin || 0,
    stops: (stopsByRoute[String(route._id)] || []).map((stop) => stop.name),
  }));

  res.json({ ok: true, routes: payload });
});

exports.getRouteLiveStatus = asyncHandler(async (req, res) => {
  const { routeId } = req.params;
  const date = req.query.date ? String(req.query.date) : getOpsDate();

  const route = await Route.findById(routeId);
  if (!route) throw new ApiError(404, "Route not found");

  const [trips, stops] = await Promise.all([
    TripInstance.find({
      routeId,
      date,
      status: "Active",
      conductorEndedAt: null,
    })
      .populate("busId", "busNumber")
      .select("direction startTime endTime actualStartTime busId lastLatitude lastLongitude lastLocationAt lastLocationName approachingStop passedStops driverLastLatitude driverLastLongitude driverLastLocationAt")
      .sort({ startTime: 1 }),
    RouteStop.find({ routeId: route._id })
      .sort({ index: 1 })
      .select("index name latitude longitude"),
  ]);

  const payload = trips.map((trip) => {
    const loc = resolveBestLocation(trip);
    return {
      id: trip._id,
      direction: trip.direction,
      startTime: trip.startTime,
      endTime: trip.endTime,
      actualStartTime: trip.actualStartTime,
      lastLatitude: loc?.lat ?? null,
      lastLongitude: loc?.lng ?? null,
      lastLocationAt: loc?.at ?? null,
      lastLocationName: loc?.name ?? null,
      approachingStop: trip.approachingStop || null,
      passedStops: trip.passedStops || [],
      bus: {
        id: trip.busId?._id || null,
        busNumber: trip.busId?.busNumber || null,
      },
    };
  });

  res.json({
    ok: true,
    route: {
      id: route._id,
      routeCode: route.routeCode,
      routeName: route.routeName,
      source: route.source,
      destination: route.destination,
      standardTripTimeMin: route.standardTripTimeMin || 0,
    },
    stops: stops.map((s) => ({
      index: s.index,
      name: s.name,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
    })),
    trips: payload,
  });
});

/**
 * Lookup or cache the geocoded coordinates for a bus-stop name.
 * Bus stops don't move so we cache forever in StopGeocode.
 */
const getOrCacheStopCoords = async (stopName) => {
  const key = stopName.trim();
  const cached = await StopGeocode.findOne({ stopName: key });
  if (cached) return { lat: cached.latitude, lng: cached.longitude };

  const result = await forwardGeocode(key);
  if (!result) return null;

  // Save to cache — ignore duplicate-key errors from parallel requests
  await StopGeocode.create({
    stopName: key,
    latitude: result.lat,
    longitude: result.lng,
    displayName: result.displayName,
  }).catch(() => {});

  return { lat: result.lat, lng: result.lng };
};

/**
 * GET /api/public/trips/:tripId/eta?userStop=StopName
 *
 * Returns the estimated arrival time for a live bus at the passenger's stop.
 *
 * Algorithm:
 *   1. Get bus current lat/lng from TripInstance.
 *   2. Geocode the passenger's stop (cached in StopGeocode).
 *   3. Call OpenRouteService for road-distance ETA.
 *      Falls back to Haversine × 1.35 road-factor at 20 km/h if ORS is unavailable.
 *
 * Response:
 *   { ok, eta: { minutes, distanceKm, text, source, busLocationName, updatedAt } }
 *   eta is null if the bus has no recorded position yet.
 */
exports.getTripEta = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const userStop = String(req.query.userStop || "").trim();

  if (!userStop) throw new ApiError(400, "userStop query param required");

  const trip = await TripInstance.findById(tripId).select(
    "lastLatitude lastLongitude lastLocationAt lastLocationName driverLastLatitude driverLastLongitude driverLastLocationAt status"
  );
  if (!trip) throw new ApiError(404, "Trip not found");

  const loc = resolveBestLocation(trip);
  if (!loc) {
    return res.json({
      ok: true,
      eta: null,
      busLocationName: null,
      reason: "bus_location_unavailable",
    });
  }

  // Resolve stop coordinates:
  //   1. RouteStop with manually-set lat/lng (most accurate — no geocoding needed)
  //   2. StopGeocode cache (Nominatim result, cached in MongoDB)
  //   3. Live Nominatim forward geocode (slowest, last resort)
  let stopCoords = null;
  const routeStop = await RouteStop.findOne({
    name: { $regex: new RegExp(`^${userStop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    latitude: { $ne: null },
    longitude: { $ne: null },
  }).select("latitude longitude");
  if (routeStop) {
    stopCoords = { lat: routeStop.latitude, lng: routeStop.longitude };
  } else {
    stopCoords = await getOrCacheStopCoords(userStop);
  }

  if (!stopCoords) {
    return res.json({
      ok: true,
      eta: null,
      busLocationName: loc.name || null,
      reason: "stop_not_geocoded",
    });
  }

  const etaResult = await getDrivingEta(
    loc.lat,
    loc.lng,
    stopCoords.lat,
    stopCoords.lng
  );

  const etaText =
    etaResult.durationMin <= 1
      ? "Arriving soon"
      : `~${etaResult.durationMin} min away`;

  res.json({
    ok: true,
    eta: {
      minutes: etaResult.durationMin,
      distanceKm: etaResult.distanceKm,
      text: etaText,
      source: etaResult.source,
      busLocationName: loc.name || null,
      updatedAt: loc.at || null,
    },
  });
});

exports.notifyTripWaiting = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const passengerId = req.passenger?.passengerId;
  const stopName = String(req.body?.stopName || "").trim();

  if (!passengerId) throw new ApiError(401, "Missing passenger session");
  if (!stopName) throw new ApiError(400, "stopName required");

  const trip = await TripInstance.findById(tripId).select(
    "routeId status conductorEndedAt passedStops"
  );
  if (!trip) throw new ApiError(404, "Trip not found");
  if (!["Scheduled", "Active"].includes(String(trip.status || "")) || trip.conductorEndedAt) {
    throw new ApiError(409, "Trip is no longer live");
  }

  const stop = await getCanonicalStopForTrip({ routeId: trip.routeId, stopName });
  if (!stop) throw new ApiError(400, "Stop not found on this route");

  if ((trip.passedStops || []).some((item) => normalizeStopName(item) === normalizeStopName(stop.name))) {
    throw new ApiError(409, "Bus has already passed this stop");
  }

  await PassengerWaitRequest.findOneAndUpdate(
    { passengerId, tripInstanceId: trip._id },
    {
      $set: {
        passengerId,
        tripInstanceId: trip._id,
        routeId: trip.routeId,
        stopName: stop.name,
        stopIndex: stop.index,
        status: "Waiting",
        notifiedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const waiting = await getPassengerWaitingStatus({ trip, passengerId });
  const summary = await getTripWaitingSnapshot(trip);

  res.json({ ok: true, waiting, summary });
});

exports.getTripWaitingStatus = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const passengerId = req.passenger?.passengerId;
  if (!passengerId) throw new ApiError(401, "Missing passenger session");

  const trip = await TripInstance.findById(tripId).select(
    "routeId status conductorEndedAt passedStops"
  );
  if (!trip) throw new ApiError(404, "Trip not found");

  const waiting = await getPassengerWaitingStatus({ trip, passengerId });
  const summary = await getTripWaitingSnapshot(trip);

  res.json({ ok: true, waiting, summary });
});

exports.createDemoBooking = asyncHandler(async (req, res) => {
  const { busNumber, routeId, source, destination, fare, passengerCount, passengerPushToken } = req.body;

  if (!busNumber) throw new ApiError(400, "busNumber required");
  if (!routeId) throw new ApiError(400, "routeId required");
  if (!source || !destination) throw new ApiError(400, "source and destination required");

  const bookingId = `QF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const normalizedBusNumber = String(busNumber);
  const bus = await Bus.findOne({ busNumber: normalizedBusNumber }).select("_id depotId status");
  if (!bus) throw new ApiError(404, "Bus not found");
  if (bus.status !== "Active") {
    throw new ApiError(409, "This bus is not active right now.");
  }
  const liveTrip = await findLiveTripForBus(bus._id, null);
  if (!liveTrip || String(liveTrip.routeId?._id || liveTrip.routeId) !== String(routeId)) {
    throw new ApiError(409, "This bus is not active right now.");
  }

  const booking = await TicketBooking.create({
    bookingId,
    busNumber: normalizedBusNumber,
    routeId: String(routeId),
    depotId: bus?.depotId || null,
    tripInstanceId: liveTrip._id,
    source: String(source),
    destination: String(destination),
    fare: Number(fare) || 0,
    status: "PAID",
    passengerCount: Number(passengerCount) || 1,
    passengerPushToken: passengerPushToken || null,
    bookedAt: new Date(),
  });

  res.status(201).json({
    ok: true,
    booking: {
      ...booking.toObject(),
      tripInstanceId: liveTrip._id,
    },
  });
});

/**
 * GET /api/public/bookings/:bookingId/status
 * Returns whether the ticket's trip is still active.
 * { ok, valid: bool, tripStatus: 'Active'|'Completed'|'Cancelled'|'Scheduled'|null }
 */
exports.getBookingStatus = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const booking = await TicketBooking.findOne({ bookingId }).select("tripInstanceId status");
  if (!booking) throw new ApiError(404, "Booking not found");

  if (!booking.tripInstanceId) {
    return res.json({ ok: true, valid: false, tripStatus: null });
  }

  const trip = await TripInstance.findById(booking.tripInstanceId).select("status conductorEndedAt actualEndTime");
  if (!trip) {
    return res.json({ ok: true, valid: false, tripStatus: null });
  }

  // Ticket is valid until the conductor explicitly ends the trip.
  // Driver ending the trip (status → "Completed") is NOT enough —
  // the conductor must also call completeConductorTrip which sets conductorEndedAt.
  const conductorEnded = trip.conductorEndedAt != null;
  const cancelled = trip.status === "Cancelled";
  const valid = !conductorEnded && !cancelled;

  res.json({
    ok: true,
    valid,
    tripStatus: trip.status,
    tripEndedAt: trip.conductorEndedAt ?? trip.actualEndTime ?? null,
  });
});

/**
 * GET /api/public/trips/:tripId/load
 *
 * Returns estimated bus load based on:
 *   1. All paid tickets for this trip (source/destination stop names)
 *   2. Conductor's live GPS position → matched to nearest stop index
 *   3. Passengers whose source stop index ≤ currentIdx < destination stop index are "onboard"
 *
 * Response:
 *   { ok, onboard, capacity, loadPercent, status, currentStopName, gpsAge }
 *   status: "empty" | "light" | "available" | "filling" | "packed" | "unavailable"
 */
const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

exports.getTripLoad = asyncHandler(async (req, res) => {
  const { tripId } = req.params;

  const trip = await TripInstance.findById(tripId)
    .populate("busId", "busNumber seatingCapacity")
    .select("routeId busId direction lastLatitude lastLongitude lastLocationAt lastLocationName driverLastLatitude driverLastLongitude driverLastLocationAt status");
  if (!trip) throw new ApiError(404, "Trip not found");

  const capacity = Number(trip.busId?.seatingCapacity) || 0;
  const loc = resolveBestLocation(trip);
  const hasLocation = loc !== null;
  const gpsAge = loc?.at
    ? Math.round((Date.now() - new Date(loc.at).getTime()) / 1000)
    : null;

  // Fetch all paid tickets for this trip upfront (needed for totalBooked fallback too)
  const tickets = await TicketBooking.find({
    tripInstanceId: trip._id,
    status: "PAID",
  })
    .select("source destination passengerCount")
    .lean();

  const totalBooked = tickets.reduce((sum, t) => sum + (Number(t.passengerCount) || 1), 0);
  console.log(`[getTripLoad] tripId=${tripId} trip._id=${trip._id} tickets=${tickets.length} totalBooked=${totalBooked}`);

  if (!hasLocation) {
    return res.json({
      ok: true,
      onboard: null,
      totalBooked,
      capacity,
      loadPercent: null,
      status: "unavailable",
      reason: "bus_location_unavailable",
      gpsAge,
    });
  }

  // Load all stops for this route (need both geocoded + non-geocoded for name→index map)
  const [geocodedStops, allStops] = await Promise.all([
    RouteStop.find({ routeId: trip.routeId, latitude: { $ne: null }, longitude: { $ne: null } })
      .sort({ index: 1 })
      .select("index name latitude longitude")
      .lean(),
    RouteStop.find({ routeId: trip.routeId })
      .sort({ index: 1 })
      .select("index name")
      .lean(),
  ]);

  if (!geocodedStops.length) {
    return res.json({
      ok: true,
      onboard: null,
      totalBooked,
      capacity,
      loadPercent: null,
      status: "unavailable",
      reason: "no_stop_coordinates",
      gpsAge,
    });
  }

  // Find nearest geocoded stop to bus's current position (best available GPS)
  let nearestStop = geocodedStops[0];
  let minDist = haversineKm(
    loc.lat,
    loc.lng,
    geocodedStops[0].latitude,
    geocodedStops[0].longitude
  );
  for (const stop of geocodedStops.slice(1)) {
    const d = haversineKm(loc.lat, loc.lng, stop.latitude, stop.longitude);
    if (d < minDist) { minDist = d; nearestStop = stop; }
  }
  const currentStopIdx = nearestStop.index;

  // Build name → index map (case-insensitive)
  const stopIndexByName = new Map(
    allStops.map((s) => [s.name.toLowerCase().trim(), s.index])
  );

  const direction = trip.direction;
  let onboard = 0;

  console.log(`[getTripLoad] direction=${direction} currentStopIdx=${currentStopIdx} nearestStop=${nearestStop.name}`);
  for (const ticket of tickets) {
    const srcKey = String(ticket.source || "").toLowerCase().trim();
    const dstKey = String(ticket.destination || "").toLowerCase().trim();
    const srcIdx = stopIndexByName.get(srcKey);
    const dstIdx = stopIndexByName.get(dstKey);
    console.log(`[getTripLoad] ticket src="${ticket.source}"(${srcIdx}) dst="${ticket.destination}"(${dstIdx}) pax=${ticket.passengerCount}`);
    if (srcIdx === undefined || dstIdx === undefined) continue;

    // UP: bus travels low → high index; DOWN: bus travels high → low index
    const isOnboard =
      direction === "UP"
        ? currentStopIdx >= srcIdx && currentStopIdx < dstIdx
        : currentStopIdx <= srcIdx && currentStopIdx > dstIdx;

    console.log(`[getTripLoad] isOnboard=${isOnboard} (currentStop=${currentStopIdx} >= src=${srcIdx} && < dst=${dstIdx})`);
    if (isOnboard) onboard += Number(ticket.passengerCount) || 1;
  }

  // Derive load status
  const loadPercent = capacity > 0 ? Math.round((onboard / capacity) * 100) : null;
  let status;
  if (loadPercent === null) {
    // No capacity configured — use raw count buckets
    status = onboard === 0 ? "empty" : onboard <= 10 ? "light" : onboard <= 25 ? "available" : onboard <= 40 ? "filling" : "packed";
  } else if (loadPercent === 0) {
    status = "empty";
  } else if (loadPercent <= 33) {
    status = "light";
  } else if (loadPercent <= 66) {
    status = "available";
  } else if (loadPercent <= 90) {
    status = "filling";
  } else {
    status = "packed";
  }

  res.json({
    ok: true,
    onboard,
    totalBooked,
    capacity,
    loadPercent,
    status,
    currentStopName: nearestStop.name,
    gpsAge,
  });
});

exports.getBookingAnalytics = asyncHandler(async (req, res) => {
  const daysRaw = Number(req.query.days);
  const monthsRaw = Number(req.query.months);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(90, daysRaw)) : 30;
  const months = Number.isFinite(monthsRaw) ? Math.max(1, Math.min(24, monthsRaw)) : 6;

  const scopeDepotId = normalizeDepotScope(req);
  const depotFilter = scopeDepotId || req.query.depotId || null;
  const operatorType = req.query.operatorType || null;
  const operatorFilter = buildOperatorFilter(operatorType);
  const { start: dayEnd } = getOpsDayWindow(getOpsDate());
  const dayStart = addUtcDays(dayEnd, -(days - 1));

  const monthEnd = new Date(`${toOpsMonthKey(new Date())}-01T00:00:00+05:30`);
  const monthStart = addUtcMonths(monthEnd, -(months - 1));

  const baseMatch = { status: "PAID" };
  if (depotFilter) baseMatch.depotId = depotFilter;
  if (operatorFilter) {
    const scopedBuses = await Bus.find({
      ...(depotFilter ? { depotId: depotFilter } : {}),
      ...operatorFilter,
    }).select("busNumber");
    baseMatch.busNumber = { $in: scopedBuses.map((row) => row.busNumber) };
  }

  const [dailyRaw, monthlyRaw] = await Promise.all([
    TicketBooking.aggregate([
      {
        $match: {
          ...baseMatch,
          bookedAt: { $gte: dayStart, $lt: addUtcDays(dayEnd, 1) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$bookedAt", timezone: OPS_TIMEZONE } },
          passengers: { $sum: { $ifNull: ["$passengerCount", 1] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    TicketBooking.aggregate([
      {
        $match: {
          ...baseMatch,
          bookedAt: { $gte: monthStart, $lt: addUtcMonths(monthEnd, 1) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$bookedAt", timezone: OPS_TIMEZONE } },
          passengers: { $sum: { $ifNull: ["$passengerCount", 1] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const dayMap = dailyRaw.reduce((acc, item) => {
    acc[item._id] = item.passengers;
    return acc;
  }, {});
  const monthMap = monthlyRaw.reduce((acc, item) => {
    acc[item._id] = item.passengers;
    return acc;
  }, {});

  const daily = [];
  for (let i = 0; i < days; i += 1) {
    const pointDate = addUtcDays(dayStart, i);
    const key = toOpsIsoDay(pointDate);
    daily.push({ label: key, passengers: dayMap[key] || 0 });
  }

  const monthly = [];
  for (let i = 0; i < months; i += 1) {
    const pointMonth = addUtcMonths(monthStart, i);
    const key = toOpsMonthKey(pointMonth);
    monthly.push({ label: key, passengers: monthMap[key] || 0 });
  }

  const monthlyWithGrowth = monthly.map((item, idx) => {
    if (idx === 0) {
      return { ...item, growthPct: null };
    }
    const prev = monthly[idx - 1].passengers;
    if (prev === 0) {
      return { ...item, growthPct: item.passengers > 0 ? 100 : 0 };
    }
    const growthPct = Number((((item.passengers - prev) / prev) * 100).toFixed(1));
    return { ...item, growthPct };
  });

  const currentMonth = monthlyWithGrowth[monthlyWithGrowth.length - 1] || null;

  res.json({
    ok: true,
    depotId: depotFilter,
    operatorType,
    days,
    months,
    daily,
    monthly: monthlyWithGrowth,
    monthlyGrowthPct: currentMonth?.growthPct ?? null,
    currentMonthPassengers: currentMonth?.passengers ?? 0,
  });
});
