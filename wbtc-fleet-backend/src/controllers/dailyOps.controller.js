const DailyBusAllocation = require("../models/DailyBusAllocation");
const DriverAssignment = require("../models/DriverAssignment");
const BusReturnLog = require("../models/BusReturnLog");
const Bus = require("../models/Bus");
const Driver = require("../models/Driver");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const normalizeDepotScope = (req) => {
  // ADMIN can pass depotId in body/query; depot roles must use their own depotId
  if (req.user.role === "ADMIN") return null;
  return req.user.depotId;
};

exports.allocateBusForDay = asyncHandler(async (req, res) => {
  const { date, depotId, busId, status, remarks } = req.body;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId;
  if (!finalDepotId) throw new ApiError(400, "depotId required");

  const bus = await Bus.findById(busId);
  if (!bus) throw new ApiError(404, "Bus not found");
  if (String(bus.depotId) !== String(finalDepotId)) throw new ApiError(400, "Bus does not belong to this depot");

  const record = await DailyBusAllocation.create({ date, depotId: finalDepotId, busId, status, remarks });
  res.status(201).json({ ok: true, allocation: record });
});

exports.assignDriver = asyncHandler(async (req, res) => {
  const { date, depotId, busId, driverId, routeId, tripTemplateId, shift } = req.body;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId;
  if (!finalDepotId) throw new ApiError(400, "depotId required");

  const [bus, driver] = await Promise.all([
    Bus.findById(busId),
    Driver.findById(driverId),
  ]);
  if (!bus) throw new ApiError(404, "Bus not found");
  if (!driver) throw new ApiError(404, "Driver not found");
  if (String(bus.depotId) !== String(finalDepotId)) throw new ApiError(400, "Bus not in this depot");
  if (String(driver.depotId) !== String(finalDepotId)) throw new ApiError(400, "Driver not in this depot");
  if (driver.status !== "Available") throw new ApiError(400, "Driver not available");

  const assignment = await DriverAssignment.create({
    date,
    depotId: finalDepotId,
    busId,
    driverId,
    routeId,
    tripTemplateId,
    shift: shift || "General",
    assignedBy: req.user.userId
  });

  res.status(201).json({ ok: true, assignment });
});

exports.logBusReturn = asyncHandler(async (req, res) => {
  const { date, depotId, busId, returnTime, kmRun, fuelLevel, cleanlinessStatus, defectReported, remarks } = req.body;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId;
  if (!finalDepotId) throw new ApiError(400, "depotId required");

  const bus = await Bus.findById(busId);
  if (!bus) throw new ApiError(404, "Bus not found");
  if (String(bus.depotId) !== String(finalDepotId)) throw new ApiError(400, "Bus not in this depot");

  const log = await BusReturnLog.create({
    date, depotId: finalDepotId, busId, returnTime, kmRun, fuelLevel,
    cleanlinessStatus, defectReported, remarks
  });

  res.status(201).json({ ok: true, returnLog: log });
});

exports.getDailySchedule = asyncHandler(async (req, res) => {
  const { date, depotId } = req.query;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId;
  if (!finalDepotId) throw new ApiError(400, "depotId required");

  const assignments = await DriverAssignment.find({ date, depotId: finalDepotId })
    .populate("busId", "busNumber")
    .populate("driverId", "empId name")
    .populate("routeId", "routeCode routeName source destination")
    .populate("tripTemplateId", "tripName startTime endTime tripType")
    .sort({ createdAt: 1 });

  res.json({ ok: true, date, depotId: finalDepotId, assignments });
});
