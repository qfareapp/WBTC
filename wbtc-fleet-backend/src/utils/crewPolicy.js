const Bus = require("../models/Bus");
const BusCrewMapping = require("../models/BusCrewMapping");

const parseDate = (dateStr) => {
  const date = new Date(`${String(dateStr)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
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

const isFixedCrewBus = (bus) => {
  if (!bus) return false;
  return String(bus.crewPolicy || "FLEXIBLE").toUpperCase() === "FIXED";
};

const findActiveCrewMapping = async (busId, dateStr) => {
  const dateFilter = buildActiveOnDateFilter(dateStr);

  return BusCrewMapping.findOne({
    busId,
    isActive: true,
    ...dateFilter,
  });
};

const ensureDriverEligibleForBus = async ({ busId, driverId, date }) => {
  const bus = await Bus.findById(busId).select("crewPolicy operatorType");
  if (!isFixedCrewBus(bus)) return { ok: true, bus };

  const mapping = await BusCrewMapping.findOne({
    busId,
    driverId,
    isActive: true,
    ...buildActiveOnDateFilter(date),
  });
  if (!mapping) {
    return { ok: false, reason: "Driver is not mapped to this fixed-crew bus", bus };
  }
  return { ok: true, bus, mapping };
};

const ensureConductorEligibleForBus = async ({ busId, conductorId, date }) => {
  const bus = await Bus.findById(busId).select("crewPolicy operatorType");
  if (!isFixedCrewBus(bus)) return { ok: true, bus };

  const mapping = await BusCrewMapping.findOne({
    busId,
    conductorId,
    isActive: true,
    ...buildActiveOnDateFilter(date),
  });
  if (!mapping) {
    return { ok: false, reason: "Conductor is not mapped to this fixed-crew bus", bus };
  }
  return { ok: true, bus, mapping };
};

module.exports = {
  isFixedCrewBus,
  findActiveCrewMapping,
  ensureDriverEligibleForBus,
  ensureConductorEligibleForBus,
};
