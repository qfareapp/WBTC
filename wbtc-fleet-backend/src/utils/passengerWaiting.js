const RouteStop = require("../models/RouteStop");
const PassengerWaitRequest = require("../models/PassengerWaitRequest");

const normalizeStopName = (value) => String(value || "").trim().toLowerCase();

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCanonicalStopForTrip = async ({ routeId, stopName }) => {
  const normalized = String(stopName || "").trim();
  if (!normalized) return null;

  return RouteStop.findOne({
    routeId,
    name: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
  })
    .sort({ index: 1 })
    .select("name index")
    .lean();
};

const getTripWaitingSnapshot = async (trip) => {
  if (!trip?._id || !trip.routeId) {
    return { totalWaiting: 0, stops: [] };
  }
  if (trip.status === "Cancelled" || trip.conductorEndedAt) {
    return { totalWaiting: 0, stops: [] };
  }

  const waitingRows = await PassengerWaitRequest.find({
    tripInstanceId: trip._id,
    status: "Waiting",
  })
    .select("stopName stopIndex")
    .sort({ stopIndex: 1, notifiedAt: 1 })
    .lean();

  if (!waitingRows.length) {
    return { totalWaiting: 0, stops: [] };
  }

  const passedSet = new Set((trip.passedStops || []).map(normalizeStopName));
  const grouped = new Map();

  for (const row of waitingRows) {
    if (passedSet.has(normalizeStopName(row.stopName))) continue;
    const key = normalizeStopName(row.stopName);
    const existing = grouped.get(key);
    if (existing) {
      existing.passengersWaiting += 1;
      continue;
    }
    grouped.set(key, {
      stopName: row.stopName,
      stopIndex: row.stopIndex,
      passengersWaiting: 1,
    });
  }

  const stops = Array.from(grouped.values()).sort((a, b) => a.stopIndex - b.stopIndex);
  const totalWaiting = stops.reduce((sum, item) => sum + item.passengersWaiting, 0);
  return { totalWaiting, stops };
};

const getPassengerWaitingStatus = async ({ trip, passengerId }) => {
  if (!trip?._id || !passengerId) return null;

  const request = await PassengerWaitRequest.findOne({
    tripInstanceId: trip._id,
    passengerId,
    status: "Waiting",
  })
    .select("stopName stopIndex notifiedAt")
    .lean();

  if (!request) return null;

  const passedSet = new Set((trip.passedStops || []).map(normalizeStopName));
  if (passedSet.has(normalizeStopName(request.stopName))) {
    return null;
  }

  return {
    stopName: request.stopName,
    stopIndex: request.stopIndex,
    notifiedAt: request.notifiedAt,
  };
};

module.exports = {
  getCanonicalStopForTrip,
  getTripWaitingSnapshot,
  getPassengerWaitingStatus,
  normalizeStopName,
};
