const Driver = require("../models/Driver");
const Depot = require("../models/Depot");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const normalizeDepotScope = (req) => {
  if (req.user.role === "ADMIN") return null;
  return req.user.depotId;
};

exports.createDriver = asyncHandler(async (req, res) => {
  const {
    empId,
    name,
    govtId,
    ownerId,
    depotId,
    licenseNumber,
    licenseExpiry,
    operatorType,
    shiftType,
    status,
    phone,
  } = req.body;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId;

  if (!finalDepotId) throw new ApiError(400, "depotId required");
  if (!empId) throw new ApiError(400, "empId required");
  if (!name) throw new ApiError(400, "name required");
  if (!licenseNumber) throw new ApiError(400, "licenseNumber required");
  if (!licenseExpiry) throw new ApiError(400, "licenseExpiry required");

  let finalOwnerId = null;
  if (ownerId) {
    const owner = await User.findOne({ _id: ownerId, role: "OWNER", active: true }).select("_id");
    if (!owner) throw new ApiError(404, "Owner not found");
    finalOwnerId = owner._id;
  }

  const depot = await Depot.findById(finalDepotId).select("operatorType");
  if (!depot) throw new ApiError(404, "Depot not found");
  const depotOperatorType = depot.operatorType || "WBTC";
  const finalOperatorType = operatorType || depotOperatorType;
  if (String(finalOperatorType) !== String(depotOperatorType)) {
    throw new ApiError(400, "Driver operatorType must match selected depot operatorType");
  }

  const driver = await Driver.create({
    empId,
    name,
    govtId,
    ownerId: finalOwnerId,
    depotId: finalDepotId,
    operatorType: finalOperatorType,
    licenseNumber,
    licenseExpiry,
    shiftType,
    status,
    phone,
  });

  res.status(201).json({ ok: true, driver });
});

exports.listDrivers = asyncHandler(async (req, res) => {
  const { depotId, status, operatorType } = req.query;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId || undefined;

  const query = {};
  if (finalDepotId) query.depotId = finalDepotId;
  if (status) query.status = status;
  if (operatorType) {
    query.$or = [{ operatorType }, ...(operatorType === "WBTC" ? [{ operatorType: { $exists: false } }] : [])];
  }

  const drivers = await Driver.find(query)
    .populate("depotId", "depotName depotCode")
    .populate("ownerId", "name username")
    .sort({ name: 1 });

  res.json({ ok: true, drivers });
});

exports.updateDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    empId,
    name,
    govtId,
    ownerId,
    depotId,
    licenseNumber,
    licenseExpiry,
    operatorType,
    shiftType,
    status,
    phone,
  } = req.body;

  const driver = await Driver.findById(id);
  if (!driver) throw new ApiError(404, "Driver not found");

  const scopeDepotId = normalizeDepotScope(req);
  if (scopeDepotId && String(driver.depotId) !== String(scopeDepotId)) {
    throw new ApiError(403, "Forbidden");
  }

  const finalDepotId = scopeDepotId || depotId || driver.depotId;
  if (!finalDepotId) throw new ApiError(400, "depotId required");

  const nextEmpId = String(empId || driver.empId).trim();
  const nextName = String(name || driver.name).trim();
  const nextLicenseNumber = String(licenseNumber || driver.licenseNumber).trim();
  const nextLicenseExpiry = licenseExpiry || driver.licenseExpiry;

  if (!nextEmpId) throw new ApiError(400, "empId required");
  if (!nextName) throw new ApiError(400, "name required");
  if (!nextLicenseNumber) throw new ApiError(400, "licenseNumber required");
  if (!nextLicenseExpiry) throw new ApiError(400, "licenseExpiry required");

  const conflict = await Driver.findOne({ empId: nextEmpId, _id: { $ne: driver._id } }).select("_id");
  if (conflict) throw new ApiError(409, "empId already exists");

  const depot = await Depot.findById(finalDepotId).select("operatorType");
  if (!depot) throw new ApiError(404, "Depot not found");
  const depotOperatorType = depot.operatorType || "WBTC";
  const finalOperatorType = operatorType || driver.operatorType || depotOperatorType;
  if (String(finalOperatorType) !== String(depotOperatorType)) {
    throw new ApiError(400, "Driver operatorType must match selected depot operatorType");
  }

  let finalOwnerId = driver.ownerId || null;
  if (ownerId === null || ownerId === "") {
    finalOwnerId = null;
  } else if (ownerId) {
    const owner = await User.findOne({ _id: ownerId, role: "OWNER", active: true }).select("_id");
    if (!owner) throw new ApiError(404, "Owner not found");
    finalOwnerId = owner._id;
  }

  driver.empId = nextEmpId;
  driver.name = nextName;
  driver.govtId = govtId === undefined ? driver.govtId : govtId || null;
  driver.ownerId = finalOwnerId;
  driver.depotId = finalDepotId;
  driver.operatorType = finalOperatorType;
  driver.licenseNumber = nextLicenseNumber;
  driver.licenseExpiry = nextLicenseExpiry;
  driver.shiftType = shiftType || driver.shiftType;
  driver.status = status || driver.status;
  driver.phone = phone === undefined ? driver.phone : phone || null;
  await driver.save();

  const updatedDriver = await Driver.findById(driver._id)
    .populate("depotId", "depotName depotCode")
    .populate("ownerId", "name username");

  res.json({ ok: true, driver: updatedDriver });
});
