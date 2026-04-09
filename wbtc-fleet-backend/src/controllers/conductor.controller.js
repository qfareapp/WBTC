const Conductor = require("../models/Conductor");
const Depot = require("../models/Depot");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { generateTemporaryPassword, hashPassword } = require("../utils/crewPassword");

const normalizeDepotScope = (req) => {
  if (req.user.role === "ADMIN") return null;
  if (req.user.role === "DEPOT_MANAGER") return req.user.depotId;
  return null;
};

const ensureConductorAccess = (req, conductor) => {
  if (req.user.role === "ADMIN") return;
  if (req.user.role === "DEPOT_MANAGER") {
    if (String(conductor.depotId) !== String(req.user.depotId || "")) {
      throw new ApiError(403, "Forbidden");
    }
    return;
  }
  if (req.user.role === "OWNER") {
    if (String(conductor.ownerId || "") !== String(req.user.userId || "")) {
      throw new ApiError(403, "Forbidden");
    }
    return;
  }
  throw new ApiError(403, "Forbidden");
};

const serializeConductor = (conductor) => {
  const plain = typeof conductor.toObject === "function" ? conductor.toObject() : { ...conductor };
  delete plain.passwordHash;
  return plain;
};

exports.createConductor = asyncHandler(async (req, res) => {
  const {
    empId,
    name,
    ownerId,
    depotId,
    operatorType,
    currentLocation,
    shiftType,
    status,
    phone,
  } = req.body;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId;

  if (!finalDepotId) throw new ApiError(400, "depotId required");
  if (!empId) throw new ApiError(400, "empId required");
  if (!name) throw new ApiError(400, "name required");

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
    throw new ApiError(400, "Conductor operatorType must match selected depot operatorType");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const conductor = await Conductor.create({
    empId,
    name,
    ownerId: finalOwnerId,
    depotId: finalDepotId,
    operatorType: finalOperatorType,
    currentLocation: currentLocation || null,
    shiftType,
    status,
    phone,
    passwordHash,
    mustChangePassword: true,
    passwordResetAt: new Date(),
  });

  res.status(201).json({
    ok: true,
    conductor: serializeConductor(conductor),
    credentials: {
      empId: conductor.empId,
      temporaryPassword,
      mustChangePassword: true,
    },
  });
});

exports.listConductors = asyncHandler(async (req, res) => {
  const { depotId, status, operatorType } = req.query;

  const scopeDepotId = normalizeDepotScope(req);
  const finalDepotId = scopeDepotId || depotId || undefined;

  const query = {};
  if (finalDepotId) query.depotId = finalDepotId;
  if (req.user.role === "OWNER") query.ownerId = req.user.userId;
  if (status) query.status = status;
  if (operatorType) {
    query.$or = [{ operatorType }, ...(operatorType === "WBTC" ? [{ operatorType: { $exists: false } }] : [])];
  }

  const conductors = await Conductor.find(query)
    .populate("depotId", "depotName depotCode")
    .populate("ownerId", "name username")
    .sort({ name: 1 });

  res.json({ ok: true, conductors: conductors.map((conductor) => serializeConductor(conductor)) });
});

exports.updateConductor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    empId,
    name,
    ownerId,
    depotId,
    operatorType,
    currentLocation,
    shiftType,
    status,
    phone,
  } = req.body;

  const conductor = await Conductor.findById(id);
  if (!conductor) throw new ApiError(404, "Conductor not found");
  ensureConductorAccess(req, conductor);

  const scopeDepotId = normalizeDepotScope(req);

  const finalDepotId = scopeDepotId || depotId || conductor.depotId;
  if (!finalDepotId) throw new ApiError(400, "depotId required");

  const nextEmpId = String(empId || conductor.empId).trim();
  const nextName = String(name || conductor.name).trim();
  if (!nextEmpId) throw new ApiError(400, "empId required");
  if (!nextName) throw new ApiError(400, "name required");

  const conflict = await Conductor.findOne({ empId: nextEmpId, _id: { $ne: conductor._id } }).select("_id");
  if (conflict) throw new ApiError(409, "empId already exists");

  const depot = await Depot.findById(finalDepotId).select("operatorType");
  if (!depot) throw new ApiError(404, "Depot not found");
  const depotOperatorType = depot.operatorType || "WBTC";
  const finalOperatorType = operatorType || conductor.operatorType || depotOperatorType;
  if (String(finalOperatorType) !== String(depotOperatorType)) {
    throw new ApiError(400, "Conductor operatorType must match selected depot operatorType");
  }

  let finalOwnerId = conductor.ownerId || null;
  if (ownerId === null || ownerId === "") {
    finalOwnerId = null;
  } else if (ownerId) {
    const owner = await User.findOne({ _id: ownerId, role: "OWNER", active: true }).select("_id");
    if (!owner) throw new ApiError(404, "Owner not found");
    finalOwnerId = owner._id;
  }

  conductor.empId = nextEmpId;
  conductor.name = nextName;
  conductor.ownerId = finalOwnerId;
  conductor.depotId = finalDepotId;
  conductor.operatorType = finalOperatorType;
  conductor.currentLocation = currentLocation === undefined ? conductor.currentLocation : currentLocation || null;
  conductor.shiftType = shiftType || conductor.shiftType;
  conductor.status = status || conductor.status;
  conductor.phone = phone === undefined ? conductor.phone : phone || null;
  await conductor.save();

  const updatedConductor = await Conductor.findById(conductor._id)
    .populate("depotId", "depotName depotCode")
    .populate("ownerId", "name username");

  res.json({ ok: true, conductor: serializeConductor(updatedConductor) });
});

exports.resetConductorPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { temporaryPassword } = req.body || {};

  const conductor = await Conductor.findById(id);
  if (!conductor) throw new ApiError(404, "Conductor not found");
  ensureConductorAccess(req, conductor);

  const nextPassword = String(temporaryPassword || generateTemporaryPassword()).trim();
  if (!nextPassword) throw new ApiError(400, "temporaryPassword required");

  conductor.passwordHash = await hashPassword(nextPassword);
  conductor.mustChangePassword = true;
  conductor.passwordResetAt = new Date();
  await conductor.save();

  res.json({
    ok: true,
    conductor: {
      id: conductor._id,
      name: conductor.name,
      empId: conductor.empId,
    },
    credentials: {
      empId: conductor.empId,
      temporaryPassword: nextPassword,
      mustChangePassword: true,
    },
  });
});
