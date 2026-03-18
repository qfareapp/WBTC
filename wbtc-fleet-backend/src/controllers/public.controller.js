const Bus = require("../models/Bus");
const TripInstance = require("../models/TripInstance");
const Route = require("../models/Route");
const RouteStop = require("../models/RouteStop");
const FareSlab = require("../models/FareSlab");
const TicketBooking = require("../models/TicketBooking");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const normalizeBusNumber = (value) => String(value || "").trim();

const startOfUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const formatDayKey = (date) => date.toISOString().slice(0, 10);
const formatMonthKey = (date) => date.toISOString().slice(0, 7);

const monthStartUtc = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

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
    date: String(date || new Date().toISOString().slice(0, 10)),
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
  const date = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);

  const route = await Route.findById(routeId);
  if (!route) throw new ApiError(404, "Route not found");

  const trips = await TripInstance.find({ routeId, date, status: "Active" })
    .populate("busId", "busNumber")
    .sort({ startTime: 1 });

  const payload = trips.map((trip) => ({
    id: trip._id,
    direction: trip.direction,
    startTime: trip.startTime,
    endTime: trip.endTime,
    actualStartTime: trip.actualStartTime,
    lastLatitude: trip.lastLatitude,
    lastLongitude: trip.lastLongitude,
    lastLocationAt: trip.lastLocationAt,
    bus: {
      id: trip.busId?._id || null,
      busNumber: trip.busId?.busNumber || null,
    },
  }));

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
    trips: payload,
  });
});

exports.createDemoBooking = asyncHandler(async (req, res) => {
  const { busNumber, routeId, source, destination, fare } = req.body;

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
    source: String(source),
    destination: String(destination),
    fare: Number(fare) || 0,
    status: "PAID",
    passengerCount: 1,
    bookedAt: new Date(),
  });

  res.status(201).json({ ok: true, booking });
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
  const now = new Date();

  const dayEnd = startOfUtcDay(now);
  const dayStart = addUtcDays(dayEnd, -(days - 1));

  const monthEnd = monthStartUtc(now);
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
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$bookedAt" } },
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
          _id: { $dateToString: { format: "%Y-%m", date: "$bookedAt" } },
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
    const key = formatDayKey(pointDate);
    daily.push({ label: key, passengers: dayMap[key] || 0 });
  }

  const monthly = [];
  for (let i = 0; i < months; i += 1) {
    const pointMonth = addUtcMonths(monthStart, i);
    const key = formatMonthKey(pointMonth);
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
