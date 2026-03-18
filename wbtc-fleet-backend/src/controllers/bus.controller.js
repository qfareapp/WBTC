const Bus = require("../models/Bus");
const Depot = require("../models/Depot");
const Route = require("../models/Route");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const normalizeDepotScope = (req) => {
  if (req.user.role === "ADMIN") return null;
  return req.user.depotId;
};

exports.createBus = asyncHandler(async (req, res) => {
  const {
    depotId,
    busNumber,
    busType,
    seatingCapacity,
    fuelType,
    operatorType,
    crewPolicy,
    ownerId,
    status,
    lastServiceDate,
  } = req.body;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId;
  if (!finalDepotId) throw new ApiError(400, "depotId required");
  if (!busNumber) throw new ApiError(400, "busNumber required");
  const depot = await Depot.findById(finalDepotId).select("operatorType");
  if (!depot) throw new ApiError(404, "Depot not found");
  const depotOperatorType = depot.operatorType || "WBTC";
  const finalOperatorType = operatorType || depotOperatorType || "WBTC";
  if (String(finalOperatorType) !== String(depotOperatorType)) {
    throw new ApiError(400, "Bus operatorType must match selected depot operatorType");
  }
  const finalCrewPolicy = crewPolicy || (finalOperatorType === "PRIVATE" ? "FIXED" : "FLEXIBLE");
  if (finalOperatorType === "PRIVATE" && finalCrewPolicy !== "FIXED") {
    throw new ApiError(400, "PRIVATE buses must use FIXED crew policy");
  }
  if (finalOperatorType === "WBTC" && finalCrewPolicy !== "FLEXIBLE") {
    throw new ApiError(400, "WBTC buses must use FLEXIBLE crew policy");
  }

  let finalOwnerId = null;
  if (ownerId) {
    const owner = await User.findOne({ _id: ownerId, role: "OWNER", active: true }).select("_id");
    if (!owner) throw new ApiError(404, "Owner not found");
    finalOwnerId = owner._id;
  }

  const bus = await Bus.create({
    depotId: finalDepotId,
    busNumber,
    busType,
    seatingCapacity,
    fuelType,
    operatorType: finalOperatorType,
    crewPolicy: finalCrewPolicy,
    ownerId: finalOwnerId,
    status,
    lastServiceDate: lastServiceDate || null,
  });

  res.status(201).json({ ok: true, bus });
});

exports.listBuses = asyncHandler(async (req, res) => {
  const { depotId, status, operatorType } = req.query;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId || undefined;

  const query = {};
  if (finalDepotId) query.depotId = finalDepotId;
  if (status) query.status = status;
  if (operatorType) {
    query.$or = [{ operatorType }, ...(operatorType === "WBTC" ? [{ operatorType: { $exists: false } }] : [])];
  }

  const buses = await Bus.find(query)
    .populate("depotId", "depotName depotCode")
    .populate("ownerId", "name username")
    .populate("attachedRouteId", "routeCode routeName depotId operatorType")
    .sort({ busNumber: 1 });

  res.json({ ok: true, buses });
});

exports.updateBus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    depotId,
    busNumber,
    busType,
    seatingCapacity,
    fuelType,
    operatorType,
    crewPolicy,
    ownerId,
    status,
    lastServiceDate,
  } = req.body;

  const bus = await Bus.findById(id);
  if (!bus) throw new ApiError(404, "Bus not found");

  const scopeDepotId = normalizeDepotScope(req);
  if (scopeDepotId && String(bus.depotId) !== String(scopeDepotId)) {
    throw new ApiError(403, "Forbidden");
  }

  const finalDepotId = scopeDepotId || depotId || bus.depotId;
  if (!finalDepotId) throw new ApiError(400, "depotId required");

  const nextBusNumber = String(busNumber || bus.busNumber).trim();
  if (!nextBusNumber) throw new ApiError(400, "busNumber required");

  const conflict = await Bus.findOne({ busNumber: nextBusNumber, _id: { $ne: bus._id } }).select("_id");
  if (conflict) throw new ApiError(409, "busNumber already exists");

  const depot = await Depot.findById(finalDepotId).select("operatorType");
  if (!depot) throw new ApiError(404, "Depot not found");
  const depotOperatorType = depot.operatorType || "WBTC";
  const finalOperatorType = operatorType || bus.operatorType || depotOperatorType;
  if (String(finalOperatorType) !== String(depotOperatorType)) {
    throw new ApiError(400, "Bus operatorType must match selected depot operatorType");
  }

  const finalCrewPolicy = crewPolicy || bus.crewPolicy || (finalOperatorType === "PRIVATE" ? "FIXED" : "FLEXIBLE");
  if (finalOperatorType === "PRIVATE" && finalCrewPolicy !== "FIXED") {
    throw new ApiError(400, "PRIVATE buses must use FIXED crew policy");
  }
  if (finalOperatorType === "WBTC" && finalCrewPolicy !== "FLEXIBLE") {
    throw new ApiError(400, "WBTC buses must use FLEXIBLE crew policy");
  }

  let finalOwnerId = bus.ownerId || null;
  if (ownerId === null || ownerId === "") {
    finalOwnerId = null;
  } else if (ownerId) {
    const owner = await User.findOne({ _id: ownerId, role: "OWNER", active: true }).select("_id");
    if (!owner) throw new ApiError(404, "Owner not found");
    finalOwnerId = owner._id;
  }

  bus.busNumber = nextBusNumber;
  bus.depotId = finalDepotId;
  bus.ownerId = finalOwnerId;
  bus.busType = busType || bus.busType;
  bus.seatingCapacity = seatingCapacity === undefined ? bus.seatingCapacity : Number(seatingCapacity || 0);
  bus.fuelType = fuelType || bus.fuelType;
  bus.operatorType = finalOperatorType;
  bus.crewPolicy = finalCrewPolicy;
  bus.status = status || bus.status;
  bus.lastServiceDate = lastServiceDate === undefined ? bus.lastServiceDate : lastServiceDate || null;
  await bus.save();

  const updatedBus = await Bus.findById(bus._id)
    .populate("depotId", "depotName depotCode")
    .populate("ownerId", "name username")
    .populate("attachedRouteId", "routeCode routeName depotId operatorType");

  res.json({ ok: true, bus: updatedBus });
});

exports.attachRouteToBus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { routeId } = req.body;

  const bus = await Bus.findById(id).select("busNumber depotId operatorType attachedRouteId");
  if (!bus) throw new ApiError(404, "Bus not found");

  if (!routeId) {
    bus.attachedRouteId = null;
    await bus.save();
    const updatedBus = await Bus.findById(bus._id)
      .populate("depotId", "depotName depotCode")
      .populate("ownerId", "name username")
      .populate("attachedRouteId", "routeCode routeName depotId operatorType");
    return res.json({ ok: true, bus: updatedBus });
  }

  const route = await Route.findById(routeId).select("routeCode routeName depotId operatorType");
  if (!route) throw new ApiError(404, "Route not found");

  if (String(route.depotId) !== String(bus.depotId)) {
    throw new ApiError(400, "Route must belong to the same depot as the bus");
  }

  const busOperatorType = bus.operatorType || "WBTC";
  const routeOperatorType = route.operatorType || "WBTC";
  if (String(busOperatorType) !== String(routeOperatorType)) {
    throw new ApiError(400, "Route operator type must match bus operator type");
  }

  bus.attachedRouteId = route._id;
  await bus.save();

  const updatedBus = await Bus.findById(bus._id)
    .populate("depotId", "depotName depotCode")
    .populate("ownerId", "name username")
    .populate("attachedRouteId", "routeCode routeName depotId operatorType");

  res.json({ ok: true, bus: updatedBus });
});
