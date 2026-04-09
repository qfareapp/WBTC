const DriverAssignment = require("../models/DriverAssignment");
const TripInstance = require("../models/TripInstance");
const Route = require("../models/Route");
const Bus = require("../models/Bus");
const Driver = require("../models/Driver");
const Conductor = require("../models/Conductor");
const TripOffer = require("../models/TripOffer");
const BusCrewMapping = require("../models/BusCrewMapping");
const RouteModel = require("../models/Route");
const RouteStop = require("../models/RouteStop");
const RouteDayActivation = require("../models/RouteDayActivation");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { ensureDriverEligibleForBus } = require("../utils/crewPolicy");
const { getOpsDayWindow } = require("../utils/opsTime");
const { getTripWaitingSnapshot } = require("../utils/passengerWaiting");
const { reverseGeocode } = require("../utils/nominatim");

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

  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    nowMinutes: Number(byType.hour) * 60 + Number(byType.minute),
  };
};

const today = () => {
  return getOpsNowParts().date;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toMinutes = (time) => {
  if (!time) return null;
  const [hh, mm] = time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
};

const fromMinutes = (mins) => {
  const safe = Math.max(0, Math.min(24 * 60 - 1, mins));
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const startOfMonth = (dateStr) => {
  if (!DATE_RE.test(dateStr)) return `${today().slice(0, 7)}-01`;
  return `${dateStr.slice(0, 7)}-01`;
};

const isValidDateString = (value) => {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const buildSummary = async (driverId, startDate, endDate, now) => {
  const assignments = await DriverAssignment.find({
    driverId,
    date: { $gte: startDate, $lte: endDate },
  }).populate(
    "tripInstanceId",
    "status actualDurationMin actualStartTime actualEndTime openingKm closingKm"
  );

  let tripsCovered = 0;
  let kmsCovered = 0;
  let driveMinutes = 0;

  for (const assignment of assignments) {
    const trip = assignment.tripInstanceId;
    if (!trip) continue;

    if (trip.status === "Completed") tripsCovered += 1;

    const openingKm = Number(trip.openingKm);
    const closingKm = Number(trip.closingKm);
    if (Number.isFinite(openingKm) && Number.isFinite(closingKm) && closingKm >= openingKm) {
      kmsCovered += closingKm - openingKm;
    }

    const duration = Number(trip.actualDurationMin);
    if (Number.isFinite(duration) && duration >= 0) {
      driveMinutes += duration;
      continue;
    }

    if (trip.actualStartTime) {
      const startMs = new Date(trip.actualStartTime).getTime();
      const endMs = trip.actualEndTime ? new Date(trip.actualEndTime).getTime() : now.getTime();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
        driveMinutes += Math.round((endMs - startMs) / 60000);
      }
    }
  }

  return {
    startDate,
    endDate,
    tripsCovered,
    kmsCovered: Number(kmsCovered.toFixed(2)),
    driveMinutes,
    driveHours: Number((driveMinutes / 60).toFixed(2)),
  };
};

const cleanupStaleDriverAssignments = async ({ driverId, date }) => {
  const openAssignments = await DriverAssignment.find({
    driverId,
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
      return !tripStatus || tripStatus === "Completed" || tripStatus === "Cancelled";
    })
    .map((assignment) => assignment._id);

  if (!staleAssignmentIds.length) return;

  await DriverAssignment.updateMany(
    { _id: { $in: staleAssignmentIds } },
    { $set: { status: "Completed" } }
  );
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

const orderRouteStopsByDirection = (routeStops = [], direction) => {
  const stops = [...routeStops];
  return direction === "DOWN" ? stops.reverse() : stops;
};

const deriveUpcomingStopWaiting = ({
  waitingSummary,
  approachingStop,
  passedStops,
  routeStops,
  direction,
  hasStarted,
}) => {
  const orderedStops = orderRouteStopsByDirection(routeStops, direction);
  const passedSet = new Set((passedStops || []).map((stop) => String(stop || "").trim().toLowerCase()));
  const normalizedApproachingStop = String(approachingStop || "").trim().toLowerCase();

  if (!orderedStops.length) {
    const fallbackMatch = (waitingSummary?.stops || []).find(
      (item) => String(item?.stopName || "").trim().toLowerCase() === normalizedApproachingStop
    );
    return {
      stopName: fallbackMatch?.stopName || null,
      passengersWaiting: Number(fallbackMatch?.passengersWaiting || 0),
    };
  }

  const approachingIndex = normalizedApproachingStop
    ? orderedStops.findIndex(
        (stop) => String(stop?.name || "").trim().toLowerCase() === normalizedApproachingStop
      )
    : -1;
  const lastPassedIndex = orderedStops.reduce(
    (latestIndex, stop, index) =>
      passedSet.has(String(stop?.name || "").trim().toLowerCase()) ? index : latestIndex,
    -1
  );
  const currentStopIndex =
    approachingIndex >= 0
      ? approachingIndex
      : hasStarted
      ? Math.min(lastPassedIndex + 1, orderedStops.length - 1)
      : -1;
  const nextStop = currentStopIndex >= 0 ? orderedStops[currentStopIndex + 1] || null : null;
  const nextStopName = String(nextStop?.name || "").trim();

  if (!nextStopName) {
    return {
      stopName: null,
      passengersWaiting: 0,
    };
  }

  const match = (waitingSummary?.stops || []).find(
    (item) => String(item?.stopName || "").trim().toLowerCase() === nextStopName.toLowerCase()
  );

  return {
    stopName: match?.stopName || nextStopName,
    passengersWaiting: Number(match?.passengersWaiting || 0),
  };
};

const parseDate = (dateStr) => {
  try {
    return getOpsDayWindow(String(dateStr)).start;
  } catch {
    return null;
  }
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

const getBusMinOpeningKm = async (busId) => {
  const bus = await Bus.findById(busId).select("lastOdometerKm");
  const busLastKm = Number(bus?.lastOdometerKm);
  if (Number.isFinite(busLastKm)) return busLastKm;

  const lastCompletedTrip = await TripInstance.findOne({
    busId,
    status: "Completed",
    closingKm: { $ne: null },
  })
    .select("closingKm")
    .sort({ actualEndTime: -1, updatedAt: -1 });

  const tripClosingKm = Number(lastCompletedTrip?.closingKm);
  if (Number.isFinite(tripClosingKm)) return tripClosingKm;
  return 0;
};

const haversineM = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const runDriverGeofenceChecks = async (tripInstanceId, busLat, busLng) => {
  const trip = await TripInstance.findById(tripInstanceId)
    .select("routeId passedStops notifiedStops approachingStop")
    .lean();
  if (!trip) return;

  const stops = await RouteStop.find({ routeId: trip.routeId, latitude: { $ne: null } })
    .sort({ index: 1 })
    .select("name latitude longitude index")
    .lean();
  if (!stops.length) return;

  const passedSet = new Set(trip.passedStops || []);
  const notifiedSet = new Set(trip.notifiedStops || []);

  const newlyPassed = [];
  const newlyNotified = [];
  let approachingStop = trip.approachingStop || null;

  for (const stop of stops) {
    const dist = haversineM(busLat, busLng, stop.latitude, stop.longitude);

    if (dist <= 100 && !passedSet.has(stop.name)) {
      newlyPassed.push(stop.name);
      passedSet.add(stop.name);
    }

    if (dist <= 300 && !passedSet.has(stop.name)) {
      if (approachingStop !== stop.name) approachingStop = stop.name;
    }

    if (dist <= 500 && !notifiedSet.has(stop.name)) {
      newlyNotified.push(stop.name);
      notifiedSet.add(stop.name);
    }
  }

  if (approachingStop && passedSet.has(approachingStop)) approachingStop = null;

  const update = { approachingStop };
  if (newlyPassed.length) update.$addToSet = { ...(update.$addToSet || {}), passedStops: { $each: newlyPassed } };
  if (newlyNotified.length) update.$addToSet = { ...(update.$addToSet || {}), notifiedStops: { $each: newlyNotified } };

  await TripInstance.findByIdAndUpdate(tripInstanceId, update);
};

const mapAssignment = async (assignment, busById = new Map(), options = {}) => {
  const trip = assignment.tripInstanceId;
  const route = assignment.routeId;
  const includeRouteStops = options.includeRouteStops === true;
  const tripBus = trip?.busId || null;
  const assignmentBus = assignment.busId || null;
  const fallbackBusId = String(assignmentBus?._id || assignmentBus || tripBus?._id || tripBus || "");
  const bus = (() => {
    const fromAssignment = assignmentBus && assignmentBus.busNumber ? assignmentBus : null;
    if (fromAssignment) return fromAssignment;
    const fromTrip = tripBus && tripBus.busNumber ? tripBus : null;
    if (fromTrip) return fromTrip;
    if (!fallbackBusId) return null;
    return busById.get(fallbackBusId) || null;
  })();
  const direction = trip?.direction || null;
  const pickupLocation = getStartLocation(route, direction);
  const dropLocation = getEndLocation(route, direction);
  const waitingSummary = trip?._id
    ? await getTripWaitingSnapshot({
        _id: trip._id,
        routeId: route?._id || assignment.routeId,
        status: trip.status,
        conductorEndedAt: trip.conductorEndedAt || null,
        passedStops: trip.passedStops || [],
      })
    : { totalWaiting: 0, stops: [] };
  const routeStops =
    route?._id
      ? await RouteStop.find({ routeId: route._id }).sort({ index: 1 }).select("index name").lean()
      : [];

  return {
    assignmentId: assignment._id,
    tripInstanceId: trip?._id || assignment.tripInstanceId,
    status: trip?.status || assignment.status,
    direction,
    bus: fallbackBusId
      ? {
          id: bus?._id || fallbackBusId,
          busNumber: bus?.busNumber || null,
          busType: bus?.busType || null,
        }
      : null,
    route: route
      ? {
          id: route._id,
          routeCode: route.routeCode,
          routeName: route.routeName,
          source: route.source,
          destination: route.destination,
        }
      : null,
    timing: {
      startTime: trip?.startTime || assignment.startTime || null,
      endTime: trip?.endTime || assignment.endTime || null,
      actualStartTime: trip?.actualStartTime || null,
      actualEndTime: trip?.actualEndTime || null,
      actualDurationMin: trip?.actualDurationMin || null,
      openingKm: trip?.openingKm ?? null,
      closingKm: trip?.closingKm ?? null,
    },
    location: {
      latitude: trip?.lastLatitude ?? null,
      longitude: trip?.lastLongitude ?? null,
      at: trip?.lastLocationAt || null,
    },
    driverLocation: {
      latitude: trip?.driverLastLatitude ?? null,
      longitude: trip?.driverLastLongitude ?? null,
      at: trip?.driverLastLocationAt || null,
    },
    progress: {
      approachingStop: trip?.approachingStop || null,
      passedStops: trip?.passedStops || [],
    },
    waitingSummary,
    upcomingStopWaiting: deriveUpcomingStopWaiting({
      waitingSummary,
      approachingStop: trip?.approachingStop || null,
      passedStops: trip?.passedStops || [],
      routeStops,
      direction,
      hasStarted: Boolean(trip?.actualStartTime),
    }),
    pickupLocation,
    dropLocation,
    routeStops: (includeRouteStops ? routeStops : []).map((stop) => ({
      index: stop.index,
      name: stop.name,
    })),
  };
};

const isMappedBusEligibleForTrip = ({ bus, route, startLocation, activeBusSet, strictRouteMatch = true }) => {
  if (!bus?._id) return false;
  if (activeBusSet?.has(String(bus._id))) return false;
  if (strictRouteMatch) {
    const attachedRouteId = String(bus.attachedRouteId || "");
    if (attachedRouteId && String(route?._id || "") && attachedRouteId !== String(route._id || "")) {
      return false;
    }
  }
  if (!startLocation) return true;
  return normalizeLocation(bus.currentLocation) === normalizeLocation(startLocation);
};

const cancelExpiredTrips = async (date, nowMinutes) => {
  if (nowMinutes < 0) return;
  const cutoff = nowMinutes - 30;
  if (cutoff < 0) return;
  const cutoffStr = fromMinutes(cutoff);

  const expiredTrips = await TripInstance.find({
    date,
    status: "Scheduled",
    startTime: { $lt: cutoffStr },
  }).select("_id");

  if (!expiredTrips.length) return;
  const tripIds = expiredTrips.map((trip) => trip._id);
  const assigned = await DriverAssignment.find({ tripInstanceId: { $in: tripIds } }).select("tripInstanceId");
  const assignedSet = new Set(assigned.map((item) => String(item.tripInstanceId)));

  const unassignedIds = tripIds.filter((id) => !assignedSet.has(String(id)));
  if (!unassignedIds.length) return;

  await TripInstance.updateMany(
    { _id: { $in: unassignedIds } },
    { $set: { status: "Cancelled" } }
  );
};

exports.listDriverTrips = asyncHandler(async (req, res) => {
  const date = req.query.date || today();
  const driverId = req.user.userId;

  const assignments = await DriverAssignment.find({ date, driverId })
    .populate("busId", "busNumber busType")
    .populate("routeId", "routeCode routeName source destination")
    .populate({
      path: "tripInstanceId",
      select:
        "direction status startTime endTime actualStartTime actualEndTime actualDurationMin openingKm closingKm lastLatitude lastLongitude lastLocationAt busId conductorEndedAt passedStops",
      populate: { path: "busId", select: "busNumber busType" },
    })
    .sort({ startTime: 1 });

  const missingBusIds = Array.from(
    new Set(
      assignments
        .map((assignment) => {
          const directBusId = assignment.busId?._id || assignment.busId || null;
          const tripBusId = assignment.tripInstanceId?.busId?._id || assignment.tripInstanceId?.busId || null;
          return String(directBusId || tripBusId || "").trim();
        })
        .filter(Boolean)
    )
  );
  const fallbackBuses = missingBusIds.length
    ? await Bus.find({ _id: { $in: missingBusIds } }).select("busNumber busType").lean()
    : [];
  const busById = new Map(fallbackBuses.map((bus) => [String(bus._id), bus]));

  const trips = await Promise.all(assignments.map((assignment) => mapAssignment(assignment, busById)));
  res.json({ ok: true, date, trips });
});

exports.getDriverTrip = asyncHandler(async (req, res) => {
  const { tripInstanceId } = req.params;
  const driverId = req.user.userId;

  const assignment = await DriverAssignment.findOne({ tripInstanceId, driverId })
    .populate("busId", "busNumber busType")
    .populate("routeId", "routeCode routeName source destination")
    .populate({
      path: "tripInstanceId",
      select:
        "direction status startTime endTime actualStartTime actualEndTime actualDurationMin openingKm closingKm lastLatitude lastLongitude lastLocationAt driverLastLatitude driverLastLongitude driverLastLocationAt busId conductorEndedAt approachingStop passedStops",
      populate: { path: "busId", select: "busNumber busType" },
    });

  if (!assignment) throw new ApiError(404, "Trip not found");

  const fallbackBusIds = Array.from(
    new Set(
      [
        assignment.busId?._id || assignment.busId || null,
        assignment.tripInstanceId?.busId?._id || assignment.tripInstanceId?.busId || null,
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  const fallbackBuses = fallbackBusIds.length
    ? await Bus.find({ _id: { $in: fallbackBusIds } }).select("busNumber busType").lean()
    : [];
  const busById = new Map(fallbackBuses.map((bus) => [String(bus._id), bus]));

  res.json({ ok: true, trip: await mapAssignment(assignment, busById, { includeRouteStops: true }) });
});

exports.startDriverTrip = asyncHandler(async (req, res) => {
  const { tripInstanceId, openingKm } = req.body;
  const driverId = req.user.userId;

  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");
  const openingKmNum = Number(openingKm);
  if (!Number.isFinite(openingKmNum) || openingKmNum < 0) {
    throw new ApiError(400, "openingKm must be a non-negative number");
  }

  const assignment = await DriverAssignment.findOne({ tripInstanceId, driverId });
  if (!assignment) throw new ApiError(404, "Trip not found");

  const trip = await TripInstance.findById(tripInstanceId);
  if (!trip) throw new ApiError(404, "Trip not found");
  if (!trip.busId) throw new ApiError(400, "Trip bus is not assigned");

  const minOpeningKm = await getBusMinOpeningKm(trip.busId);
  if (openingKmNum < minOpeningKm) {
    throw new ApiError(400, `openingKm must be >= ${minOpeningKm}`);
  }

  if (!trip.actualStartTime) {
    trip.actualStartTime = new Date();
  }
  trip.openingKm = openingKmNum;
  trip.status = "Active";
  await trip.save();

  if (assignment.status !== "Active") {
    assignment.status = "Active";
    await assignment.save();
  }

  res.json({ ok: true, trip });
});

exports.completeDriverTrip = asyncHandler(async (req, res) => {
  const { tripInstanceId, closingKm } = req.body;
  const driverId = req.user.userId;

  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");
  const closingKmNum = Number(closingKm);
  if (!Number.isFinite(closingKmNum) || closingKmNum < 0) {
    throw new ApiError(400, "closingKm must be a non-negative number");
  }

  const assignment = await DriverAssignment.findOne({ tripInstanceId, driverId });
  if (!assignment) throw new ApiError(404, "Trip not found");

  const trip = await TripInstance.findById(tripInstanceId);
  if (!trip) throw new ApiError(404, "Trip not found");

  const route = await Route.findById(trip.routeId);
  const endTime = new Date();
  if (typeof trip.openingKm === "number" && closingKmNum < trip.openingKm) {
    throw new ApiError(400, "closingKm cannot be less than openingKm");
  }

  trip.actualEndTime = endTime;
  trip.closingKm = closingKmNum;
  if (trip.actualStartTime) {
    trip.actualDurationMin = Math.max(
      0,
      Math.round((endTime.getTime() - trip.actualStartTime.getTime()) / 60000)
    );
  }
  trip.status = "Completed";
  await trip.save();

  assignment.status = "Completed";
  await assignment.save();

  const endLocation = getEndLocation(route, trip.direction);
  if (endLocation) {
    const updates = [];
    if (trip.busId) {
      updates.push(
        Bus.findByIdAndUpdate(trip.busId, {
          $set: {
            currentLocation: endLocation,
            lastOdometerKm: closingKmNum,
          },
        })
      );
    }
    if (trip.busId) {
      const activeMappings = await BusCrewMapping.find({ busId: trip.busId, isActive: true }).select("driverId conductorId");
      const driverIds = Array.from(
        new Set(activeMappings.map((mapping) => String(mapping.driverId || "").trim()).filter(Boolean))
      );
      const conductorIds = Array.from(
        new Set(activeMappings.map((mapping) => String(mapping.conductorId || "").trim()).filter(Boolean))
      );
      if (driverIds.length) {
        updates.push(Driver.updateMany({ _id: { $in: driverIds } }, { $set: { currentLocation: endLocation } }));
      } else if (assignment.driverId) {
        updates.push(Driver.findByIdAndUpdate(assignment.driverId, { $set: { currentLocation: endLocation } }));
      }
      if (conductorIds.length) {
        updates.push(Conductor.updateMany({ _id: { $in: conductorIds } }, { $set: { currentLocation: endLocation } }));
      }
    } else if (assignment.driverId) {
      updates.push(Driver.findByIdAndUpdate(assignment.driverId, { $set: { currentLocation: endLocation } }));
    }
    if (updates.length) await Promise.all(updates);
  } else if (trip.busId) {
    await Bus.findByIdAndUpdate(trip.busId, { $set: { lastOdometerKm: closingKmNum } });
  }

  res.json({ ok: true, trip });
});

exports.updateDriverLocation = asyncHandler(async (req, res) => {
  const { tripInstanceId, latitude, longitude } = req.body;
  const driverId = req.user.userId;

  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new ApiError(400, "latitude and longitude required");
  }

  const assignment = await DriverAssignment.findOne({ tripInstanceId, driverId });
  if (!assignment) throw new ApiError(404, "Trip not found");

  const trip = await TripInstance.findById(tripInstanceId);
  if (!trip) throw new ApiError(404, "Trip not found");
  if (trip.status === "Completed") throw new ApiError(409, "Trip already completed");

  let locationName = null;
  try {
    locationName = await reverseGeocode(latitude, longitude);
  } catch {
    // non-fatal
  }

  trip.driverLastLatitude = latitude;
  trip.driverLastLongitude = longitude;
  trip.driverLastLocationAt = new Date();
  await trip.save();

  void runDriverGeofenceChecks(tripInstanceId, latitude, longitude).catch(() => {});

  res.json({ ok: true, locationName });
});

exports.updateDriverDuty = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const driverId = req.user.userId;

  if (!status) throw new ApiError(400, "status required");
  if (!["Available", "OnLeave"].includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, "Driver not found");

  driver.status = status;
  await driver.save();

  res.json({
    ok: true,
    driver: {
      id: driver._id,
      name: driver.name,
      empId: driver.empId,
      status: driver.status,
      currentLocation: driver.currentLocation || null,
    },
  });
});

exports.updateDriverDutyLocation = asyncHandler(async (req, res) => {
  throw new ApiError(403, "Driver duty location is managed automatically from assigned bus start point");
});

const collectEligibleTripOffersForDriver = async ({ driverId, date = today(), debug = false }) => {
  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, "Driver not found");

  await cleanupStaleDriverAssignments({ driverId, date });

  if (driver.status !== "Available") {
    return {
      date,
      offers: [],
      debug: debug ? { enabled: true, totalCandidates: 0, skippedCount: 0, summary: {}, skipped: [] } : undefined,
    };
  }

  const activeAssignment = await DriverAssignment.findOne({
    date,
    driverId,
    status: { $in: ["Scheduled", "Active"] },
  }).select("_id");
  if (activeAssignment) {
    return {
      date,
      offers: [],
      debug: debug ? { enabled: true, totalCandidates: 0, skippedCount: 0, summary: {}, skipped: [] } : undefined,
    };
  }

  const mappedRows = await BusCrewMapping.find({
    driverId,
    isActive: true,
    ...buildActiveOnDateFilter(date),
  })
    .populate("busId", "busNumber busType currentLocation status depotId attachedRouteId")
    .select("busId")
    .lean();
  const mappedBusDocs = mappedRows.map((row) => row.busId).filter(Boolean);
  const mappedBusIds = new Set(mappedBusDocs.map((bus) => String(bus._id)));
  if (mappedBusIds.size === 0) {
    return {
      date,
      offers: [],
      debug: debug ? { enabled: true, totalCandidates: 0, skippedCount: 0, summary: {}, skipped: [] } : undefined,
    };
  }
  const mappedRouteBusDocs = mappedBusDocs.filter((bus) => String(bus.status || "") === "Active");

  const { nowMinutes } = getOpsNowParts();
  await cancelExpiredTrips(date, nowMinutes);

  const trips = await TripInstance.find({
    date,
    status: "Scheduled",
    startTime: { $gte: fromMinutes(Math.max(0, nowMinutes - 10)) },
  })
    .populate("routeId", "routeCode routeName source destination assignmentMode depotId")
    .populate("busId", "busNumber busType currentLocation")
    .sort({ startTime: 1 });

  if (!trips.length) {
    return {
      date,
      offers: [],
      debug: debug ? { enabled: true, totalCandidates: 0, skippedCount: 0, summary: {}, skipped: [] } : undefined,
    };
  }

  const routeIds = Array.from(
    new Set(trips.map((trip) => String(trip.routeId?._id || trip.routeId)).filter(Boolean))
  );
  const activations = await RouteDayActivation.find({
    date,
    routeId: { $in: routeIds },
  }).select("routeId autoOffersEnabled");
  const offersEnabledByRoute = new Map(
    activations.map((item) => [String(item.routeId), item.autoOffersEnabled !== false])
  );

  const tripIds = trips.map((trip) => trip._id);
  const [assignments, rejects] = await Promise.all([
    DriverAssignment.find({ tripInstanceId: { $in: tripIds } }).select("tripInstanceId"),
    TripOffer.find({ tripInstanceId: { $in: tripIds }, driverId, status: "Rejected" }).select("tripInstanceId"),
  ]);

  const assignedSet = new Set(assignments.map((item) => String(item.tripInstanceId)));
  const rejectedSet = new Set(rejects.map((item) => String(item.tripInstanceId)));

  const activeBusAssignments = await DriverAssignment.find({ date, status: "Active" }).select("busId");
  const activeBusSet = new Set(activeBusAssignments.map((item) => String(item.busId)));

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
    if (!route) {
      trackSkip(trip, "missing_route");
      continue;
    }
    if (route.assignmentMode !== "AUTO") {
      trackSkip(trip, "route_not_auto");
      continue;
    }
    if (offersEnabledByRoute.has(String(route._id)) && offersEnabledByRoute.get(String(route._id)) !== true) {
      trackSkip(trip, "auto_offers_disabled_for_route_day");
      continue;
    }
    if (String(route.depotId) !== String(driver.depotId)) {
      trackSkip(trip, "depot_mismatch");
      continue;
    }
    if (assignedSet.has(String(trip._id))) {
      trackSkip(trip, "trip_already_assigned");
      continue;
    }
    if (rejectedSet.has(String(trip._id))) {
      trackSkip(trip, "driver_rejected_trip");
      continue;
    }

    const tripStartMinutes = toMinutes(trip.startTime);
    if (tripStartMinutes !== null && tripStartMinutes < nowMinutes - 10) {
      trackSkip(trip, "trip_offer_expired");
      continue;
    }

    const startLocation = getStartLocation(route, trip.direction);
    let eligibleMappedForRoute = mappedRouteBusDocs.filter((bus) => {
      if (String(bus.depotId || "") !== String(route.depotId || "")) return false;
      return isMappedBusEligibleForTrip({
        bus,
        route,
        startLocation,
        activeBusSet,
        strictRouteMatch: true,
      });
    });
    if (!eligibleMappedForRoute.length) {
      eligibleMappedForRoute = mappedRouteBusDocs.filter((bus) => {
        if (String(bus.depotId || "") !== String(route.depotId || "")) return false;
        return isMappedBusEligibleForTrip({
          bus,
          route,
          startLocation,
          activeBusSet,
          strictRouteMatch: false,
        });
      });
    }
    if (!eligibleMappedForRoute.length) {
      trackSkip(trip, "trip_without_assigned_bus");
      continue;
    }

    const inferredBusForTrip = eligibleMappedForRoute[0];
    const effectiveBusId = String(inferredBusForTrip?._id || "");
    const eligibility = await ensureDriverEligibleForBus({ busId: effectiveBusId || null, driverId, date });
    if (!eligibility.ok) {
      trackSkip(trip, `driver_not_eligible:${eligibility.reason || "unknown"}`);
      continue;
    }

    const resolvedBusOptions = eligibleMappedForRoute
      .filter((bus) => !activeBusSet.has(String(bus._id)))
      .map((bus) => ({
        id: bus._id,
        busNumber: bus.busNumber,
        busType: bus.busType,
        currentLocation: bus.currentLocation || null,
      }));

    offers.push({
      tripInstanceId: trip._id,
      route: {
        id: route._id,
        routeCode: route.routeCode,
        routeName: route.routeName,
        source: route.source,
        destination: route.destination,
      },
      direction: trip.direction,
      startTime: trip.startTime,
      endTime: trip.endTime,
      busAssigned: inferredBusForTrip
        ? {
            id: inferredBusForTrip._id,
            busNumber: inferredBusForTrip.busNumber,
            busType: inferredBusForTrip.busType,
          }
        : null,
      busOptions: resolvedBusOptions,
      pickupLocation: startLocation,
      dropLocation: getEndLocation(route, trip.direction),
    });
  }

  offers.sort((a, b) => {
    const aMinutes = toMinutes(a.startTime);
    const bMinutes = toMinutes(b.startTime);
    if (aMinutes === null && bMinutes === null) return 0;
    if (aMinutes === null) return 1;
    if (bMinutes === null) return -1;
    return aMinutes - bMinutes;
  });

  const limitedOffers = offers.slice(0, 5);
  if (!debug) return { date, offers: limitedOffers };

  const summary = skipped.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  return {
    date,
    offers: limitedOffers,
    debug: {
      enabled: true,
      totalCandidates: trips.length,
      skippedCount: skipped.length,
      summary,
      skipped,
    },
  };
};

exports.listTripOffers = asyncHandler(async (req, res) => {
  const driverId = req.user.userId;
  const date = req.query.date || today();
  const debug = String(req.query.debug || "").toLowerCase() === "true";
  const result = await collectEligibleTripOffersForDriver({ driverId, date, debug });

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  if (!debug) return res.json({ ok: true, date: result.date, offers: result.offers });
  return res.json({ ok: true, date: result.date, offers: result.offers, debug: result.debug });
});

exports.registerPushToken = asyncHandler(async (req, res) => {
  const driverId = req.user.userId;
  const normalizedToken = String(req.body?.token || "").trim();
  const normalizedPlatform = String(req.body?.platform || "").trim() || null;
  const requestedProvider = String(req.body?.provider || "").trim().toLowerCase();
  const normalizedProvider = requestedProvider === "fcm" ? "fcm" : "expo";

  if (!normalizedToken) throw new ApiError(400, "token required");

  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, "Driver not found");

  const existingTokens = Array.isArray(driver.pushTokens) ? driver.pushTokens : [];
  driver.pushTokens = [
    {
      token: normalizedToken,
      platform: normalizedPlatform,
      provider: normalizedProvider,
      updatedAt: new Date(),
    },
    ...existingTokens.filter((item) => {
      const itemToken = String(item?.token || "").trim();
      const itemPlatform = String(item?.platform || "").trim() || null;
      if (itemToken === normalizedToken) return false;
      if (normalizedPlatform && itemPlatform === normalizedPlatform) return false;
      return true;
    }),
  ].slice(0, 5);
  await driver.save();

  res.json({ ok: true, tokens: driver.pushTokens.length });
});

exports.unregisterPushToken = asyncHandler(async (req, res) => {
  const driverId = req.user.userId;
  const normalizedToken = String(req.body?.token || "").trim();

  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, "Driver not found");

  const existingTokens = Array.isArray(driver.pushTokens) ? driver.pushTokens : [];
  driver.pushTokens = normalizedToken
    ? existingTokens.filter((item) => String(item?.token || "") !== normalizedToken)
    : [];
  await driver.save();

  res.json({ ok: true, tokens: driver.pushTokens.length });
});

exports.acceptTripOffer = asyncHandler(async (req, res) => {
  const { tripInstanceId } = req.body;
  const driverId = req.user.userId;
  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");

  const { nowMinutes } = getOpsNowParts();
  await cancelExpiredTrips(today(), nowMinutes);

  const [driver, trip] = await Promise.all([
    Driver.findById(driverId),
    TripInstance.findById(tripInstanceId).populate("routeId", "routeCode routeName source destination assignmentMode depotId"),
  ]);
  if (!driver) throw new ApiError(404, "Driver not found");
  if (!trip) throw new ApiError(404, "Trip not found");
  if (trip.status !== "Scheduled") throw new ApiError(409, "Trip not available");
  if (!trip.routeId || trip.routeId.assignmentMode !== "AUTO") throw new ApiError(400, "Trip not in AUTO mode");
  const activation = await RouteDayActivation.findOne({ date: trip.date, routeId: trip.routeId._id })
    .select("autoOffersEnabled");
  if (activation && activation.autoOffersEnabled === false) {
    throw new ApiError(409, "Route is deactivated for auto assignment offers");
  }
  if (driver.status !== "Available") throw new ApiError(409, "Driver not on duty");

  const tripStartMinutes = toMinutes(trip.startTime);
  if (tripStartMinutes !== null && tripStartMinutes < nowMinutes - 30) {
    throw new ApiError(409, "Trip offer expired");
  }

  const startLocation = getStartLocation(trip.routeId, trip.direction);

  const mappedRows = await BusCrewMapping.find({
    driverId,
    isActive: true,
    ...buildActiveOnDateFilter(trip.date),
  })
    .populate("busId", "currentLocation status depotId attachedRouteId")
    .select("busId")
    .lean();
  const mappedBusDocs = mappedRows.map((row) => row.busId).filter(Boolean);
  const mappedBusIds = new Set(mappedBusDocs.map((bus) => String(bus._id)));
  const mappedBusById = new Map(mappedBusDocs.map((bus) => [String(bus._id), bus]));
  if (mappedBusIds.size === 0) {
    throw new ApiError(409, "No owner-assigned bus found for this driver");
  }

  let assignedBusId = trip.busId?._id || trip.busId || null;
  if (assignedBusId && mappedBusIds.size > 0 && !mappedBusIds.has(String(assignedBusId))) {
    assignedBusId = null;
  }
  if (!assignedBusId) {
    let candidateBuses = mappedBusDocs.filter((bus) =>
      isMappedBusEligibleForTrip({
        bus,
        route: trip.routeId,
        startLocation,
        activeBusSet: new Set(),
        strictRouteMatch: true,
      })
    );
    if (!candidateBuses.length) {
      candidateBuses = mappedBusDocs.filter((bus) =>
        isMappedBusEligibleForTrip({
          bus,
          route: trip.routeId,
          startLocation,
          activeBusSet: new Set(),
          strictRouteMatch: false,
        })
      );
    }

    const candidateIds = candidateBuses.map((bus) => String(bus._id));

    if (!candidateIds.length) {
      throw new ApiError(409, "No owner-assigned route bus available for this trip");
    }

    const blockedBusIds = await DriverAssignment.distinct("busId", {
      date: trip.date,
      status: { $in: ["Scheduled", "Active"] },
      busId: { $in: candidateIds },
    });
    const blockedSet = new Set(blockedBusIds.map((id) => String(id)));
    const freeBusId = candidateIds.find((id) => !blockedSet.has(String(id)));
    if (!freeBusId) {
      throw new ApiError(409, "All eligible buses are already allocated");
    }

    assignedBusId = freeBusId;
    trip.busId = freeBusId;
    await trip.save();
  } else if (String(trip.busId || "") !== String(assignedBusId)) {
    trip.busId = assignedBusId;
    await trip.save();
  }

  const assignedBus = mappedBusById.get(String(assignedBusId || ""));
  if (
    startLocation &&
    normalizeLocation(assignedBus?.currentLocation) &&
    normalizeLocation(assignedBus.currentLocation) !== normalizeLocation(startLocation)
  ) {
    throw new ApiError(409, "Your assigned bus is not at the pickup location");
  }

  const eligibility = await ensureDriverEligibleForBus({
    busId: assignedBusId,
    driverId,
    date: trip.date,
  });
  if (!eligibility.ok) throw new ApiError(409, eligibility.reason);

  const existingAssignment = await DriverAssignment.findOne({ tripInstanceId: trip._id });
  if (existingAssignment) throw new ApiError(409, "Trip already assigned");

  const currentActiveAssignment = await DriverAssignment.findOne({
    date: trip.date,
    driverId,
    status: "Active",
  }).select("_id");
  if (currentActiveAssignment) {
    throw new ApiError(409, "Finish current active trip before accepting a new offer");
  }

  const conflicts = await DriverAssignment.find({ date: trip.date, driverId, status: { $in: ["Scheduled", "Active"] } });
  const hasOverlap = conflicts.some((item) => {
    if (!item.startTime || !item.endTime || !trip.startTime || !trip.endTime) return false;
    const aStart = toMinutes(item.startTime);
    const aEnd = toMinutes(item.endTime);
    const bStart = toMinutes(trip.startTime);
    const bEnd = toMinutes(trip.endTime);
    if ([aStart, aEnd, bStart, bEnd].some((v) => v === null)) return false;
    return aStart < bEnd && bStart < aEnd;
  });
  if (hasOverlap) throw new ApiError(409, "Driver already scheduled for another trip");

  const assignment = await DriverAssignment.create({
    date: trip.date,
    depotId: trip.depotId,
    busId: assignedBusId,
    driverId,
    routeId: trip.routeId._id,
    tripTemplateId: trip._id,
    tripInstanceId: trip._id,
    startTime: trip.startTime,
    endTime: trip.endTime,
    restUntilTime: trip.endTime,
    status: "Scheduled",
  });

  await TripOffer.findOneAndUpdate(
    { tripInstanceId: trip._id, driverId },
    { status: "Accepted" },
    { upsert: true, new: true }
  );

  res.json({ ok: true, assignment });
});

exports.rejectTripOffer = asyncHandler(async (req, res) => {
  const { tripInstanceId } = req.body;
  const driverId = req.user.userId;
  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");

  await TripOffer.findOneAndUpdate(
    { tripInstanceId, driverId },
    { status: "Rejected" },
    { upsert: true, new: true }
  );

  res.json({ ok: true });
});

exports.cancelAcceptedTrip = asyncHandler(async (req, res) => {
  const { tripInstanceId } = req.body;
  const driverId = req.user.userId;
  if (!tripInstanceId) throw new ApiError(400, "tripInstanceId required");

  const assignment = await DriverAssignment.findOne({ tripInstanceId, driverId });
  if (!assignment) throw new ApiError(404, "No accepted trip found");
  if (assignment.status !== "Scheduled") {
    throw new ApiError(409, "Only scheduled accepted trips can be cancelled");
  }

  const trip = await TripInstance.findById(tripInstanceId).select("status");
  if (!trip) throw new ApiError(404, "Trip not found");
  if (trip.status !== "Scheduled") {
    throw new ApiError(409, "Trip is no longer cancellable");
  }

  await DriverAssignment.deleteOne({ _id: assignment._id });
  // Keep a rejection marker so a cancelled offer is not immediately re-offered to the same driver.
  await TripOffer.findOneAndUpdate(
    { tripInstanceId, driverId },
    { status: "Rejected" },
    { upsert: true, new: true }
  );

  res.json({ ok: true, tripInstanceId });
});

exports.listDutyLocations = asyncHandler(async (req, res) => {
  const driverId = req.user.userId;
  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, "Driver not found");

  const routes = await RouteModel.find({ depotId: driver.depotId })
    .select("source destination")
    .lean();

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

exports.collectEligibleTripOffersForDriver = collectEligibleTripOffersForDriver;

exports.getDriverSummary = asyncHandler(async (req, res) => {
  const driverId = req.user.userId;
  const now = new Date();
  const todayDate = today();

  const rangeStart = req.query.startDate || todayDate;
  const rangeEnd = req.query.endDate || todayDate;

  if (!isValidDateString(rangeStart) || !isValidDateString(rangeEnd)) {
    throw new ApiError(400, "startDate and endDate must be in YYYY-MM-DD format");
  }
  if (rangeStart > rangeEnd) {
    throw new ApiError(400, "startDate cannot be after endDate");
  }

  const monthStart = startOfMonth(todayDate);

  const [todaySummary, monthSummary, rangeSummary] = await Promise.all([
    buildSummary(driverId, todayDate, todayDate, now),
    buildSummary(driverId, monthStart, todayDate, now),
    buildSummary(driverId, rangeStart, rangeEnd, now),
  ]);

  res.json({
    ok: true,
    today: todaySummary,
    thisMonth: monthSummary,
    range: rangeSummary,
  });
});
