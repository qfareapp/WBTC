const BusCrewMapping = require("../models/BusCrewMapping");
const Bus = require("../models/Bus");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const normalizeDepotScope = (req) => {
  if (req.user.role === "ADMIN") return null;
  return req.user.depotId;
};

const deactivateExpiredCrewMappings = async (anchorDate = new Date(), extraFilter = {}) => {
  await BusCrewMapping.updateMany(
    {
      ...extraFilter,
      isActive: true,
      activeTo: { $ne: null, $lt: anchorDate },
    },
    { $set: { isActive: false } }
  );
};

exports.upsertBusCrewMapping = asyncHandler(async (req, res) => {
  const { busId, driverId, conductorId, activeFrom, activeTo } = req.body;
  if (!busId || !driverId || !conductorId) {
    throw new ApiError(400, "busId, driverId and conductorId required");
  }

  const scopeDepotId = normalizeDepotScope(req);
  const bus = await Bus.findById(busId).select("depotId crewPolicy operatorType");
  if (!bus) throw new ApiError(404, "Bus not found");
  if (scopeDepotId && String(bus.depotId) !== String(scopeDepotId)) {
    throw new ApiError(403, "Bus does not belong to your depot");
  }
  if (String(bus.crewPolicy || "FLEXIBLE") !== "FIXED") {
    throw new ApiError(400, "Crew mapping allowed only for FIXED crew policy buses");
  }

  await deactivateExpiredCrewMappings(new Date(), { busId });

  const existing = await BusCrewMapping.findOne({
    busId,
    driverId,
    conductorId,
    isActive: true,
  });
  if (existing) {
    const populatedExisting = await BusCrewMapping.findById(existing._id)
      .populate("busId", "busNumber operatorType crewPolicy")
      .populate("driverId", "name empId")
      .populate("conductorId", "name empId");
    return res.json({ ok: true, mapping: populatedExisting });
  }

  const mapping = await BusCrewMapping.create({
    busId,
    driverId,
    conductorId,
    activeFrom: activeFrom || new Date(),
    activeTo: activeTo || null,
    isActive: true,
  });

  const populated = await BusCrewMapping.findById(mapping._id)
    .populate("busId", "busNumber operatorType crewPolicy")
    .populate("driverId", "name empId")
    .populate("conductorId", "name empId");

  res.status(201).json({ ok: true, mapping: populated });
});

exports.listBusCrewMappings = asyncHandler(async (req, res) => {
  const { busId, active = "true", operatorType } = req.query;
  const scopeDepotId = normalizeDepotScope(req);

  const query = {};
  if (busId) query.busId = busId;
  if (active === "true") query.isActive = true;

  let mappings = await BusCrewMapping.find(query)
    .populate("busId", "busNumber depotId operatorType crewPolicy")
    .populate("driverId", "name empId")
    .populate("conductorId", "name empId")
    .sort({ updatedAt: -1 });

  if (scopeDepotId) {
    mappings = mappings.filter((item) => String(item.busId?.depotId || "") === String(scopeDepotId));
  }
  if (operatorType) {
    mappings = mappings.filter((item) => String(item.busId?.operatorType || "WBTC") === String(operatorType));
  }

  res.json({ ok: true, mappings });
});
