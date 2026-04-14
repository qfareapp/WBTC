const mongoose = require("mongoose");
const Route = require("../models/Route");
const RouteStop = require("../models/RouteStop");
const StopGeocode = require("../models/StopGeocode");
const StopMaster = require("../models/StopMaster");
const StopBoardingPoint = require("../models/StopBoardingPoint");
const FareSlab = require("../models/FareSlab");
const TripInstance = require("../models/TripInstance");
const Bus = require("../models/Bus");
const Depot = require("../models/Depot");
const RouteDayActivation = require("../models/RouteDayActivation");
const TicketBooking = require("../models/TicketBooking");
const Driver = require("../models/Driver");
const Conductor = require("../models/Conductor");
const DriverAssignment = require("../models/DriverAssignment");
const ConductorAssignment = require("../models/ConductorAssignment");
const BusCrewMapping = require("../models/BusCrewMapping");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { getOpsDate, getOpsMonth, toOpsIsoDay, getOpsPeriodWindow } = require("../utils/opsTime");
const {
  getPreferredStopFields,
  serializeRouteStop,
  toNumberOrNull,
  toTrimmedOrNull,
} = require("../utils/routeStopDirection");

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
  return toOpsIsoDay(value);
};

const toPct = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : 0);

const normalizeLocation = (value) => String(value || "").trim().toLowerCase();
const normalizeStopText = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizeRouteStopInput = (stop = {}, idx = 0) => {
  const upLatitude = toNumberOrNull(stop.upLatitude);
  const upLongitude = toNumberOrNull(stop.upLongitude);
  const downLatitude = toNumberOrNull(stop.downLatitude);
  const downLongitude = toNumberOrNull(stop.downLongitude);
  const preferredLatitude =
    upLatitude != null ? upLatitude : downLatitude != null ? downLatitude : toNumberOrNull(stop.latitude);
  const preferredLongitude =
    upLongitude != null ? upLongitude : downLongitude != null ? downLongitude : toNumberOrNull(stop.longitude);
  const upLandmarkImageUrl = toTrimmedOrNull(stop.upLandmarkImageUrl);
  const downLandmarkImageUrl = toTrimmedOrNull(stop.downLandmarkImageUrl);
  const preferredLandmarkImageUrl =
    upLandmarkImageUrl || downLandmarkImageUrl || toTrimmedOrNull(stop.landmarkImageUrl);

  return {
    index: Number(stop.index ?? idx),
    name: String(stop.name || "").trim(),
    stopMasterId: stop.stopMasterId || null,
    upBoardingPointId: stop.upBoardingPointId || null,
    downBoardingPointId: stop.downBoardingPointId || null,
    upTowards: toTrimmedOrNull(stop.upTowards),
    downTowards: toTrimmedOrNull(stop.downTowards),
    latitude: preferredLatitude,
    longitude: preferredLongitude,
    landmarkImageUrl: preferredLandmarkImageUrl,
    upLatitude,
    upLongitude,
    upLandmarkImageUrl,
    downLatitude,
    downLongitude,
    downLandmarkImageUrl,
  };
};

const getOrCreateStopMaster = async (name) => {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) return null;
  const normalizedName = normalizeStopText(trimmedName);
  return StopMaster.findOneAndUpdate(
    { normalizedName },
    {
      $setOnInsert: {
        name: trimmedName,
        normalizedName,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const resolveBoardingPoint = async ({
  stopMasterId,
  boardingPointId,
  towards,
  latitude,
  longitude,
  landmarkImageUrl,
}) => {
  if (!stopMasterId) return null;

  const normalizedStopMasterId = String(stopMasterId);
  let point = null;

  if (boardingPointId && mongoose.Types.ObjectId.isValid(boardingPointId)) {
    point = await StopBoardingPoint.findById(boardingPointId);
    if (point && String(point.stopMasterId) !== normalizedStopMasterId) {
      point = null;
    }
  }

  const trimmedTowards = toTrimmedOrNull(towards);
  const normalizedTowards = normalizeStopText(trimmedTowards);

  if (!point && trimmedTowards) {
    point = await StopBoardingPoint.findOne({
      stopMasterId,
      normalizedTowards,
    });
  }

  const nextLatitude = toNumberOrNull(latitude);
  const nextLongitude = toNumberOrNull(longitude);
  const nextImage = toTrimmedOrNull(landmarkImageUrl);

  if (!point) {
    if (!trimmedTowards) return null;
    point = await StopBoardingPoint.create({
      stopMasterId,
      towards: trimmedTowards,
      normalizedTowards,
      latitude: nextLatitude,
      longitude: nextLongitude,
      landmarkImageUrl: nextImage,
    });
    return point;
  }

  let changed = false;
  if (trimmedTowards && point.towards !== trimmedTowards) {
    point.towards = trimmedTowards;
    point.normalizedTowards = normalizedTowards;
    changed = true;
  }
  if (nextLatitude != null && point.latitude !== nextLatitude) {
    point.latitude = nextLatitude;
    changed = true;
  }
  if (nextLongitude != null && point.longitude !== nextLongitude) {
    point.longitude = nextLongitude;
    changed = true;
  }
  if (nextImage && point.landmarkImageUrl !== nextImage) {
    point.landmarkImageUrl = nextImage;
    changed = true;
  }
  if (changed) await point.save();

  return point;
};

const enrichStopsWithReusableBoardingPoints = async (sortedStops = []) => {
  const result = [];
  for (const stop of sortedStops) {
    const stopMaster = await getOrCreateStopMaster(stop.name);
    const upPoint = await resolveBoardingPoint({
      stopMasterId: stopMaster?._id || null,
      boardingPointId: stop.upBoardingPointId,
      towards: stop.upTowards,
      latitude: stop.upLatitude,
      longitude: stop.upLongitude,
      landmarkImageUrl: stop.upLandmarkImageUrl,
    });
    const downPoint = await resolveBoardingPoint({
      stopMasterId: stopMaster?._id || null,
      boardingPointId: stop.downBoardingPointId,
      towards: stop.downTowards,
      latitude: stop.downLatitude,
      longitude: stop.downLongitude,
      landmarkImageUrl: stop.downLandmarkImageUrl,
    });

    const upLatitude = toNumberOrNull(upPoint?.latitude) ?? stop.upLatitude ?? null;
    const upLongitude = toNumberOrNull(upPoint?.longitude) ?? stop.upLongitude ?? null;
    const downLatitude = toNumberOrNull(downPoint?.latitude) ?? stop.downLatitude ?? null;
    const downLongitude = toNumberOrNull(downPoint?.longitude) ?? stop.downLongitude ?? null;
    const upLandmarkImageUrl = toTrimmedOrNull(upPoint?.landmarkImageUrl) || stop.upLandmarkImageUrl || null;
    const downLandmarkImageUrl = toTrimmedOrNull(downPoint?.landmarkImageUrl) || stop.downLandmarkImageUrl || null;

    result.push({
      ...stop,
      stopMasterId: stopMaster?._id || null,
      upBoardingPointId: upPoint?._id || null,
      downBoardingPointId: downPoint?._id || null,
      upTowards: upPoint?.towards || stop.upTowards || null,
      downTowards: downPoint?.towards || stop.downTowards || null,
      upLatitude,
      upLongitude,
      downLatitude,
      downLongitude,
      upLandmarkImageUrl,
      downLandmarkImageUrl,
      latitude:
        upLatitude != null ? upLatitude : downLatitude != null ? downLatitude : stop.latitude ?? null,
      longitude:
        upLongitude != null ? upLongitude : downLongitude != null ? downLongitude : stop.longitude ?? null,
      landmarkImageUrl: upLandmarkImageUrl || downLandmarkImageUrl || stop.landmarkImageUrl || null,
    });
  }
  return result;
};

const upsertStopGeocodes = async (stops = []) => {
  const writes = stops
    .map((stop) => ({ stop, preferred: getPreferredStopFields(stop) }))
    .filter(({ stop, preferred }) => String(stop.name || "").trim() && preferred.latitude != null && preferred.longitude != null)
    .map(({ stop, preferred }) => ({
      updateOne: {
        filter: { stopName: String(stop.name).trim() },
        update: {
          $set: {
            latitude: Number(preferred.latitude),
            longitude: Number(preferred.longitude),
          },
          $setOnInsert: {
            displayName: null,
          },
        },
        upsert: true,
      },
    }));

  if (!writes.length) return;
  await StopGeocode.bulkWrite(writes, { ordered: false });
};

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
  while (time <= end) {
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

  let sortedStops = stops
    .map((stop, idx) => normalizeRouteStopInput(stop, idx))
    .sort((a, b) => a.index - b.index);

  if (sortedStops.some((stop) => !stop.name)) throw new ApiError(400, "Stop name required");
  sortedStops = await enrichStopsWithReusableBoardingPoints(sortedStops);

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
      stopMasterId: stop.stopMasterId ?? null,
      upBoardingPointId: stop.upBoardingPointId ?? null,
      downBoardingPointId: stop.downBoardingPointId ?? null,
      upTowards: stop.upTowards ?? null,
      downTowards: stop.downTowards ?? null,
      latitude: stop.latitude ?? null,
      longitude: stop.longitude ?? null,
      landmarkImageUrl: stop.landmarkImageUrl ?? null,
      upLatitude: stop.upLatitude ?? null,
      upLongitude: stop.upLongitude ?? null,
      upLandmarkImageUrl: stop.upLandmarkImageUrl ?? null,
      downLatitude: stop.downLatitude ?? null,
      downLongitude: stop.downLongitude ?? null,
      downLandmarkImageUrl: stop.downLandmarkImageUrl ?? null,
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

  await upsertStopGeocodes(sortedStops);

  res.status(201).json({ ok: true, route, stops: stopDocs, fareSlabs: slabDocs });
});

exports.getRouteFare = asyncHandler(async (req, res) => {
  const route = await Route.findById(req.params.id);
  if (!route) throw new ApiError(404, "Route not found");

  const [stops, fareSlabs] = await Promise.all([
    RouteStop.find({ routeId: route._id })
      .sort({ index: 1 })
      .populate("stopMasterId", "name")
      .populate("upBoardingPointId", "towards latitude longitude landmarkImageUrl")
      .populate("downBoardingPointId", "towards latitude longitude landmarkImageUrl"),
    FareSlab.find({ routeId: route._id }).sort({ fromKm: 1 }),
  ]);

  res.json({ ok: true, route, stops: stops.map((stop) => serializeRouteStop(stop.toObject ? stop.toObject() : stop)), fareSlabs });
});

exports.listRoutes = asyncHandler(async (req, res) => {
  const query = {};
  if (req.query.depotId) query.depotId = req.query.depotId;
  if (req.query.assignmentMode) query.assignmentMode = req.query.assignmentMode;
  const operatorFilter =
    req.user?.role === "ADMIN" ? null : buildOperatorFilter(req.query.operatorType);
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

  let sortedStops = stops
    .map((stop, idx) => normalizeRouteStopInput(stop, idx))
    .sort((a, b) => a.index - b.index);

  if (sortedStops.some((stop) => !stop.name)) throw new ApiError(400, "Stop name required");
  sortedStops = await enrichStopsWithReusableBoardingPoints(sortedStops);

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
      stopMasterId: stop.stopMasterId ?? null,
      upBoardingPointId: stop.upBoardingPointId ?? null,
      downBoardingPointId: stop.downBoardingPointId ?? null,
      upTowards: stop.upTowards ?? null,
      downTowards: stop.downTowards ?? null,
      latitude: stop.latitude ?? null,
      longitude: stop.longitude ?? null,
      landmarkImageUrl: stop.landmarkImageUrl ?? null,
      upLatitude: stop.upLatitude ?? null,
      upLongitude: stop.upLongitude ?? null,
      upLandmarkImageUrl: stop.upLandmarkImageUrl ?? null,
      downLatitude: stop.downLatitude ?? null,
      downLongitude: stop.downLongitude ?? null,
      downLandmarkImageUrl: stop.downLandmarkImageUrl ?? null,
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

  await upsertStopGeocodes(sortedStops);

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
  const schedulingBusIdsUp = finalBusIdsUp.length ? finalBusIdsUp : finalBusIdsDown;
  const schedulingBusIdsDown = finalBusIdsDown.length ? finalBusIdsDown : finalBusIdsUp;

  const allIds = Array.from(new Set([...schedulingBusIdsUp, ...schedulingBusIdsDown]));
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
    if (!schedulingBusIdsUp.length) break;
    const trip = upTimeline[i];
    const busId = schedulingBusIdsUp[i % schedulingBusIdsUp.length];
    await createOrUpdateTrip(trip, busId);
  }
  for (let i = 0; i < downTimeline.length; i += 1) {
    if (!schedulingBusIdsDown.length) break;
    const trip = downTimeline[i];
    const busId = schedulingBusIdsDown[i % schedulingBusIdsDown.length];
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
      ...(upTimeline.length > 0 && schedulingBusIdsUp.length === 0
        ? ["No eligible UP buses found. Route activated without UP trip allocation."]
        : []),
      ...(downTimeline.length > 0 && schedulingBusIdsDown.length === 0
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

  const activeTrip = await TripInstance.findOne({
    date,
    routeId: route._id,
    status: "Active",
    releasedForReuse: { $ne: true },
  }).select("_id");
  if (activeTrip) {
    throw new ApiError(409, "Cannot deactivate route while an active trip is running");
  }

  const tripBusIds = await TripInstance.distinct("busId", {
    date,
    routeId: route._id,
    busId: { $ne: null },
  });
  const assignedBusIds = Array.from(
    new Set([
      ...(activation.busIdsUp || []).map((id) => String(id)),
      ...(activation.busIdsDown || []).map((id) => String(id)),
      ...tripBusIds.map((id) => String(id || "")).filter(Boolean),
    ])
  );

  await Promise.all([
    TripInstance.updateMany(
      {
        date,
        routeId: route._id,
        status: "Scheduled",
      },
      {
        $set: {
          status: "Cancelled",
          releasedForReuse: true,
        },
      }
    ),
    DriverAssignment.deleteMany({
      date,
      routeId: route._id,
      status: "Scheduled",
    }),
    ConductorAssignment.deleteMany({
      date,
      routeId: route._id,
      status: "Scheduled",
    }),
  ]);

  if (assignedBusIds.length) {
    const activeMappings = await BusCrewMapping.find({
      busId: { $in: assignedBusIds },
      isActive: true,
    }).select("driverId conductorId");

    const driverIds = Array.from(
      new Set(activeMappings.map((mapping) => String(mapping.driverId || "").trim()).filter(Boolean))
    );
    const conductorIds = Array.from(
      new Set(activeMappings.map((mapping) => String(mapping.conductorId || "").trim()).filter(Boolean))
    );

    const resetUpdates = [
      Bus.updateMany(
        { _id: { $in: assignedBusIds } },
        { $set: { currentLocation: null } }
      ),
    ];
    if (driverIds.length) {
      resetUpdates.push(
        Driver.updateMany(
          { _id: { $in: driverIds } },
          { $set: { currentLocation: null } }
        )
      );
    }
    if (conductorIds.length) {
      resetUpdates.push(
        Conductor.updateMany(
          { _id: { $in: conductorIds } },
          { $set: { currentLocation: null } }
        )
      );
    }
    await Promise.all(resetUpdates);
  }

  const deactivatedAt = new Date();
  await RouteDayActivation.deleteOne({ _id: activation._id });

  res.json({
    ok: true,
    date,
    routeId: route._id,
    autoOffersEnabled: false,
    deactivatedAt,
    resetBusIds: assignedBusIds,
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

  let periodStart;
  let periodEnd;

  if (mode === "daily") {
    ({ start: periodStart, end: periodEnd } = getOpsPeriodWindow("daily", { date: req.query.date || getOpsDate() }));
  } else if (mode === "monthly") {
    ({ start: periodStart, end: periodEnd } = getOpsPeriodWindow("monthly", { month: req.query.month || getOpsMonth() }));
  } else if (mode === "custom") {
    ({ start: periodStart, end: periodEnd } = getOpsPeriodWindow("custom", req.query));
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

/**
 * GET /api/routes/stops/search?q=Ultadanga
 * Returns unique stops matching the query (name prefix, case-insensitive).
 * Deduplicates by name — picks the entry with coordinates when available.
 */
exports.searchStops = asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ ok: true, stops: [] });

  const excludeRouteId =
    req.query.excludeRouteId && mongoose.Types.ObjectId.isValid(req.query.excludeRouteId)
      ? new mongoose.Types.ObjectId(req.query.excludeRouteId)
      : null;

  const routeQuery = {};
  if (excludeRouteId) routeQuery._id = { $ne: excludeRouteId };

  const [matchingRoutes, cachedStops, stopMasters] = await Promise.all([
    Route.find(routeQuery).select("_id routeCode routeName").lean(),
    StopGeocode.find({
      stopName: { $regex: q, $options: "i" },
    })
      .select("stopName latitude longitude")
      .sort({ stopName: 1 })
      .limit(75)
      .lean()
      .then((rows) =>
        rows.map((row) => ({
          name: row.stopName,
          latitude: row.latitude ?? null,
          longitude: row.longitude ?? null,
          routeId: null,
          routeCode: null,
          routeName: null,
          source: "STOP_GEOCODE",
        }))
      ),
    StopMaster.find({
      name: { $regex: q, $options: "i" },
    })
      .select("_id name")
      .sort({ name: 1 })
      .limit(75)
      .lean(),
  ]);

  const cachedStopByName = new Map(
    cachedStops.map((stop) => [String(stop.name || "").trim().toLowerCase(), stop])
  );

  const routeIds = matchingRoutes.map((route) => route._id);
  const routeMetaById = new Map(matchingRoutes.map((route) => [String(route._id), route]));

  const routeStopQuery = {
    name: { $regex: q, $options: "i" },
  };
  if (Object.keys(routeQuery).length) {
    routeStopQuery.routeId = { $in: routeIds };
  }

  const routeStops = await RouteStop.find(routeStopQuery)
    .select("routeId name stopMasterId latitude longitude upLatitude upLongitude downLatitude downLongitude")
    .sort({ name: 1, upLatitude: -1, downLatitude: -1, latitude: -1 })
    .limit(75)
    .lean()
    .then((rows) =>
      rows.map((row) => {
        const route = routeMetaById.get(String(row.routeId));
        const cached = cachedStopByName.get(String(row.name || "").trim().toLowerCase());
        const preferred = getPreferredStopFields(row);
        return {
          name: row.name,
          latitude: preferred.latitude ?? cached?.latitude ?? null,
          longitude: preferred.longitude ?? cached?.longitude ?? null,
          upLatitude: toNumberOrNull(row.upLatitude),
          upLongitude: toNumberOrNull(row.upLongitude),
          downLatitude: toNumberOrNull(row.downLatitude),
          downLongitude: toNumberOrNull(row.downLongitude),
          stopMasterId: row.stopMasterId ?? null,
          routeId: row.routeId ?? null,
          routeCode: route?.routeCode ?? null,
          routeName: route?.routeName ?? null,
          source: "ROUTE_STOP",
        };
      })
    );

  const masterStops = stopMasters.map((row) => ({
    name: row.name,
    latitude: null,
    longitude: null,
    upLatitude: null,
    upLongitude: null,
    downLatitude: null,
    downLongitude: null,
    stopMasterId: row._id,
    routeId: null,
    routeCode: null,
    routeName: null,
    source: "STOP_MASTER",
  }));

  const stops = [...routeStops, ...masterStops, ...cachedStops];

  // Deduplicate by name — prefer entries that have coordinates
  const map = new Map();
  for (const stop of stops) {
    const key = String(stop.name || "").trim().toLowerCase();
    if (!key) continue;

    const existing = map.get(key);
    const stopHasCoords = stop.latitude != null && stop.longitude != null;
    const existingHasCoords = existing && existing.latitude != null && existing.longitude != null;

    if (!existing || (stopHasCoords && !existingHasCoords)) {
      map.set(key, stop);
      continue;
    }

    if (
      existing &&
      existing.source === "STOP_GEOCODE" &&
      stop.source === "ROUTE_STOP" &&
      stopHasCoords === existingHasCoords
    ) {
      map.set(key, stop);
    }
  }

  res.json({
    ok: true,
    stops: Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        name: s.name,
        latitude: s.latitude ?? null,
        longitude: s.longitude ?? null,
        upLatitude: s.upLatitude ?? null,
        upLongitude: s.upLongitude ?? null,
        downLatitude: s.downLatitude ?? null,
        downLongitude: s.downLongitude ?? null,
        stopMasterId: s.stopMasterId ?? null,
        routeId: s.routeId ?? null,
        routeCode: s.routeCode ?? null,
        routeName: s.routeName ?? null,
      })),
  });
});

exports.listStopBoardingPoints = asyncHandler(async (req, res) => {
  const stopId = String(req.params.stopId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(stopId)) {
    throw new ApiError(400, "Valid stopId required");
  }

  const stopMaster = await StopMaster.findById(stopId).select("name");
  if (!stopMaster) throw new ApiError(404, "Stop not found");

  const boardingPoints = await StopBoardingPoint.find({ stopMasterId: stopId })
    .select("towards latitude longitude landmarkImageUrl")
    .sort({ towards: 1 })
    .lean();

  res.json({
    ok: true,
    stop: {
      id: stopMaster._id,
      name: stopMaster.name,
    },
    boardingPoints: boardingPoints.map((point) => ({
      id: point._id,
      towards: point.towards,
      latitude: point.latitude ?? null,
      longitude: point.longitude ?? null,
      landmarkImageUrl: point.landmarkImageUrl ?? null,
    })),
  });
});
