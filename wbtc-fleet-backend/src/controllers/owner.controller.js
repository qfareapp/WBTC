const Bus = require("../models/Bus");
const Route = require("../models/Route");
const TripInstance = require("../models/TripInstance");
const TicketBooking = require("../models/TicketBooking");
const Driver = require("../models/Driver");
const Conductor = require("../models/Conductor");
const DriverAssignment = require("../models/DriverAssignment");
const ConductorAssignment = require("../models/ConductorAssignment");
const BusCrewMapping = require("../models/BusCrewMapping");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { computeOwnerPaymentRows } = require("../utils/ownerPayments");

const toIsoDay = (date) => date.toISOString().slice(0, 10);
const dayWindowFromIso = (isoDate) => {
  const start = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, "Invalid date. Use YYYY-MM-DD");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const getPeriodWindow = (mode, query) => {
  const now = new Date();
  if (mode === "daily") {
    const date = query.date || toIsoDay(now);
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) throw new ApiError(400, "Invalid date. Use YYYY-MM-DD");
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  if (mode === "monthly") {
    const month = String(query.month || now.toISOString().slice(0, 7));
    const start = new Date(`${month}-01T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) throw new ApiError(400, "Invalid month. Use YYYY-MM");
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { start, end };
  }
  if (mode === "custom") {
    const start = new Date(`${String(query.startDate || "")}T00:00:00.000Z`);
    const endInput = new Date(`${String(query.endDate || "")}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(endInput.getTime())) {
      throw new ApiError(400, "Invalid startDate/endDate. Use YYYY-MM-DD");
    }
    if (start > endInput) throw new ApiError(400, "startDate must be <= endDate");
    const end = new Date(endInput);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  throw new ApiError(400, "mode must be daily, monthly, or custom");
};

const loadOwnerBuses = async (ownerId) =>
  Bus.find({ ownerId })
    .populate("depotId", "depotName depotCode")
    .populate("attachedRouteId", "routeCode routeName source destination")
    .sort({ busNumber: 1 });

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

const syncCrewLocationToBus = async ({ bus, driverId, conductorId }) => {
  const location = String(bus?.currentLocation || "").trim();
  if (!location) return;
  const updates = [];
  if (driverId) updates.push(Driver.findByIdAndUpdate(driverId, { $set: { currentLocation: location } }));
  if (conductorId) updates.push(Conductor.findByIdAndUpdate(conductorId, { $set: { currentLocation: location } }));
  if (updates.length) await Promise.all(updates);
};

exports.getOwnerFleetDashboard = asyncHandler(async (req, res) => {
  const ownerId = req.user.userId;
  const mode = String(req.query.mode || "daily").toLowerCase();
  const { start, end } = getPeriodWindow(mode, req.query);
  const dateStart = toIsoDay(start);
  const dateEnd = toIsoDay(new Date(end.getTime() - 1));

  const buses = await loadOwnerBuses(ownerId);
  if (!buses.length) {
    return res.json({
      ok: true,
      mode,
      period: { startDate: dateStart, endDate: dateEnd },
      summary: {
        totalBuses: 0,
        activeBuses: 0,
        liveBuses: 0,
        totalRoutes: 0,
        ticketsGenerated: 0,
        fareCollected: 0,
        totalKmCovered: 0,
        totalTrips: 0,
        completedTrips: 0,
        completionRatePct: 0,
        avgFarePerTicket: 0,
      },
      routeDistribution: [],
      buses: [],
    });
  }

  const busIds = buses.map((bus) => bus._id);
  const busNumberSet = buses.map((bus) => bus.busNumber);

  const [ticketRows, tripRows, liveTrips, todayDriverAssignments, todayConductorAssignments] = await Promise.all([
    TicketBooking.aggregate([
      {
        $match: {
          status: "PAID",
          busNumber: { $in: busNumberSet },
          bookedAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: { busNumber: "$busNumber", routeId: "$routeId" },
          tickets: { $sum: { $ifNull: ["$passengerCount", 1] } },
          fare: { $sum: { $ifNull: ["$fare", 0] } },
        },
      },
    ]),
    TripInstance.find({
      busId: { $in: busIds },
      date: { $gte: dateStart, $lte: dateEnd },
    })
      .select("busId routeId status date lastLatitude lastLongitude lastLocationAt openingKm closingKm")
      .lean(),
    TripInstance.find({
      busId: { $in: busIds },
      status: "Active",
      date: toIsoDay(new Date()),
    })
      .select("busId routeId lastLatitude lastLongitude lastLocationAt")
      .populate("routeId", "routeCode routeName")
      .lean(),
    DriverAssignment.find({ date: toIsoDay(new Date()), busId: { $in: busIds } })
      .populate("driverId", "name empId")
      .sort({ updatedAt: -1 })
      .lean(),
    ConductorAssignment.find({ date: toIsoDay(new Date()), busId: { $in: busIds } })
      .populate("conductorId", "name empId")
      .sort({ updatedAt: -1 })
      .lean(),
  ]);

  const lastCompletedTrips = await TripInstance.find({
    busId: { $in: busIds },
    status: "Completed",
  })
    .select("busId routeId direction actualEndTime updatedAt")
    .populate("routeId", "routeCode routeName source destination")
    .sort({ actualEndTime: -1, updatedAt: -1 })
    .lean();
  const lastCompletedByBus = {};
  for (const trip of lastCompletedTrips) {
    const key = String(trip.busId || "");
    if (!key || lastCompletedByBus[key]) continue;
    lastCompletedByBus[key] = trip;
  }

  const routeIds = Array.from(new Set(tripRows.map((row) => String(row.routeId)).filter(Boolean)));
  const routes = await Route.find({ _id: { $in: routeIds } }).select("routeCode routeName").lean();
  const routeMap = routes.reduce((acc, route) => {
    acc[String(route._id)] = route;
    return acc;
  }, {});

  const ticketsByBus = {};
  const routeKpis = {};
  for (const row of ticketRows) {
    const busNumber = row._id.busNumber;
    const routeId = String(row._id.routeId || "");
    if (!ticketsByBus[busNumber]) ticketsByBus[busNumber] = { tickets: 0, fare: 0 };
    ticketsByBus[busNumber].tickets += row.tickets;
    ticketsByBus[busNumber].fare += row.fare;

    if (!routeKpis[routeId]) {
      routeKpis[routeId] = { tickets: 0, fare: 0, trips: 0, completedTrips: 0, totalKmCovered: 0, buses: new Set() };
    }
    routeKpis[routeId].tickets += row.tickets;
    routeKpis[routeId].fare += row.fare;
  }

  const tripsByBus = {};
  let totalTrips = 0;
  let completedTrips = 0;
  for (const trip of tripRows) {
    const busIdKey = String(trip.busId);
    if (!tripsByBus[busIdKey]) tripsByBus[busIdKey] = { trips: 0, completed: 0 };
    tripsByBus[busIdKey].trips += 1;
    totalTrips += 1;
    if (trip.status === "Completed") {
      tripsByBus[busIdKey].completed += 1;
      completedTrips += 1;
    }
    const routeId = String(trip.routeId || "");
    if (!routeKpis[routeId]) {
      routeKpis[routeId] = { tickets: 0, fare: 0, trips: 0, completedTrips: 0, totalKmCovered: 0, buses: new Set() };
    }
    routeKpis[routeId].trips += 1;
    if (trip.status === "Completed") routeKpis[routeId].completedTrips += 1;
    const openingKm = Number(trip.openingKm);
    const closingKm = Number(trip.closingKm);
    if (Number.isFinite(openingKm) && Number.isFinite(closingKm) && closingKm >= openingKm) {
      routeKpis[routeId].totalKmCovered += closingKm - openingKm;
    }
    routeKpis[routeId].buses.add(busIdKey);
  }

  const liveByBus = liveTrips.reduce((acc, row) => {
    acc[String(row.busId)] = row;
    return acc;
  }, {});
  const driverByBus = todayDriverAssignments.reduce((acc, row) => {
    if (!acc[String(row.busId)]) acc[String(row.busId)] = row.driverId || null;
    return acc;
  }, {});
  const conductorByBus = todayConductorAssignments.reduce((acc, row) => {
    if (!acc[String(row.busId)]) acc[String(row.busId)] = row.conductorId || null;
    return acc;
  }, {});

  const busRows = buses.map((bus) => {
    const busIdKey = String(bus._id);
    const ticketInfo = ticketsByBus[bus.busNumber] || { tickets: 0, fare: 0 };
    const tripInfo = tripsByBus[busIdKey] || { trips: 0, completed: 0 };
    const live = liveByBus[busIdKey] || null;
    const lastCompleted = lastCompletedByBus[busIdKey] || null;
    const driver = driverByBus[busIdKey] || null;
    const conductor = conductorByBus[busIdKey] || null;
    const attachedRoute = bus.attachedRouteId || null;

    let lastTripEndLocation = null;
    if (lastCompleted?.routeId?.source && lastCompleted?.routeId?.destination) {
      const endLocation =
        String(lastCompleted.direction || "UP") === "DOWN"
          ? lastCompleted.routeId.source
          : lastCompleted.routeId.destination;
      lastTripEndLocation = {
        name: endLocation,
        at: lastCompleted.actualEndTime || lastCompleted.updatedAt || null,
      };
    }

    return {
      id: bus._id,
      busNumber: bus.busNumber,
      busType: bus.busType,
      status: bus.status,
      operatorType: bus.operatorType || "WBTC",
      depot: bus.depotId
        ? {
            id: bus.depotId._id,
            depotName: bus.depotId.depotName,
            depotCode: bus.depotId.depotCode,
          }
        : null,
      currentLocation: bus.currentLocation || lastTripEndLocation?.name || null,
      attachedRoute: attachedRoute
        ? {
            id: attachedRoute._id || null,
            routeCode: attachedRoute.routeCode || "--",
            routeName: attachedRoute.routeName || "Route",
            source: attachedRoute.source || "--",
            destination: attachedRoute.destination || "--",
          }
        : null,
      lastTripEndLocation,
      liveRoute: live?.routeId
        ? {
            id: live.routeId._id || null,
            routeCode: live.routeId.routeCode || "--",
            routeName: live.routeId.routeName || "Route",
          }
        : null,
      liveLocation: {
        latitude: live?.lastLatitude ?? null,
        longitude: live?.lastLongitude ?? null,
        at: live?.lastLocationAt || null,
      },
      assignedDriver: driver
        ? { id: driver._id, name: driver.name, empId: driver.empId }
        : null,
      assignedConductor: conductor
        ? { id: conductor._id, name: conductor.name, empId: conductor.empId }
        : null,
      ticketsGenerated: ticketInfo.tickets,
      fareCollected: Number(ticketInfo.fare.toFixed(2)),
      trips: tripInfo.trips,
      completedTrips: tripInfo.completed,
    };
  });

  const totalTickets = busRows.reduce((sum, row) => sum + row.ticketsGenerated, 0);
  const totalFare = busRows.reduce((sum, row) => sum + row.fareCollected, 0);
  const liveBusCount = busRows.filter((row) => row.liveRoute).length;
  const activeBuses = busRows.filter((row) => row.status === "Active").length;
  const totalKmCovered = Object.values(routeKpis).reduce((sum, item) => sum + (item.totalKmCovered || 0), 0);

  const routeDistribution = Object.entries(routeKpis).map(([routeId, item]) => ({
    routeId,
    routeCode: routeMap[routeId]?.routeCode || "--",
    routeName: routeMap[routeId]?.routeName || "Route",
    buses: item.buses.size,
    // Route-wise "trips" should mean covered trips by this owner's fleet.
    trips: item.completedTrips,
    totalKmCovered: Number((item.totalKmCovered || 0).toFixed(2)),
    ticketsGenerated: item.tickets,
    fareCollected: Number(item.fare.toFixed(2)),
  }));
  routeDistribution.sort((a, b) => b.fareCollected - a.fareCollected);

  res.json({
    ok: true,
    mode,
    period: { startDate: dateStart, endDate: dateEnd },
    summary: {
      totalBuses: busRows.length,
      activeBuses,
      liveBuses: liveBusCount,
      totalRoutes: routeDistribution.length,
      ticketsGenerated: totalTickets,
      fareCollected: Number(totalFare.toFixed(2)),
      totalKmCovered: Number(totalKmCovered.toFixed(2)),
      totalTrips,
      completedTrips,
      completionRatePct: totalTrips ? Number(((completedTrips / totalTrips) * 100).toFixed(1)) : 0,
      avgFarePerTicket: totalTickets ? Number((totalFare / totalTickets).toFixed(2)) : 0,
    },
    routeDistribution,
    buses: busRows,
  });
});

exports.updateOwnerBusLocation = asyncHandler(async (req, res) => {
  const ownerId = req.user.userId;
  const { busId } = req.params;
  const { location } = req.body;

  const nextLocation = String(location || "").trim();
  if (!nextLocation) throw new ApiError(400, "location required");

  const bus = await Bus.findOne({ _id: busId, ownerId })
    .select("busNumber currentLocation attachedRouteId")
    .populate("attachedRouteId", "routeCode routeName source destination");
  if (!bus) throw new ApiError(404, "Bus not found in your fleet");
  if (!bus.attachedRouteId) throw new ApiError(400, "Attach this bus to a route before setting start location");

  const source = String(bus.attachedRouteId.source || "").trim();
  const destination = String(bus.attachedRouteId.destination || "").trim();
  const sourceNorm = source.toLowerCase();
  const destinationNorm = destination.toLowerCase();
  const nextNorm = nextLocation.toLowerCase();

  if (nextNorm !== sourceNorm && nextNorm !== destinationNorm) {
    throw new ApiError(
      400,
      `Invalid location. Choose either '${source}' or '${destination}' for route ${bus.attachedRouteId.routeCode || ""}`.trim()
    );
  }

  bus.currentLocation = nextNorm === sourceNorm ? source : destination;
  await bus.save();

  const activeMappings = await BusCrewMapping.find({ busId: bus._id, isActive: true }).select("driverId conductorId");
  const driverIds = Array.from(
    new Set(
      activeMappings
        .map((mapping) => String(mapping.driverId || "").trim())
        .filter(Boolean)
    )
  );
  const conductorIds = Array.from(
    new Set(
      activeMappings
        .map((mapping) => String(mapping.conductorId || "").trim())
        .filter(Boolean)
    )
  );
  const updates = [];
  if (driverIds.length) {
    updates.push(
      Driver.updateMany(
        { _id: { $in: driverIds } },
        { $set: { currentLocation: bus.currentLocation } }
      )
    );
  }
  if (conductorIds.length) {
    updates.push(
      Conductor.updateMany(
        { _id: { $in: conductorIds } },
        { $set: { currentLocation: bus.currentLocation } }
      )
    );
  }
  if (updates.length) await Promise.all(updates);

  res.json({
    ok: true,
    bus: {
      id: bus._id,
      busNumber: bus.busNumber,
      currentLocation: bus.currentLocation,
      attachedRoute: {
        id: bus.attachedRouteId._id,
        routeCode: bus.attachedRouteId.routeCode || "--",
        routeName: bus.attachedRouteId.routeName || "Route",
        source,
        destination,
      },
    },
  });
});

exports.listOwnerPersonnel = asyncHandler(async (req, res) => {
  const ownerId = req.user.userId;
  const query = { ownerId, status: "Available" };
  const [drivers, conductors] = await Promise.all([
    Driver.find(query).select("name empId depotId status").lean(),
    Conductor.find(query).select("name empId depotId status").lean(),
  ]);

  res.json({ ok: true, drivers, conductors });
});

exports.updateOwnerBusStatus = asyncHandler(async (req, res) => {
  const ownerId = req.user.userId;
  const { busId } = req.params;
  const { status, active } = req.body;

  const bus = await Bus.findOne({ _id: busId, ownerId });
  if (!bus) throw new ApiError(404, "Bus not found in your fleet");

  let nextStatus = status;
  if (!nextStatus && typeof active === "boolean") {
    nextStatus = active ? "Active" : "UnderMaintenance";
  }
  if (!["Active", "Breakdown", "UnderMaintenance"].includes(String(nextStatus))) {
    throw new ApiError(400, "Invalid status");
  }

  bus.status = nextStatus;
  await bus.save();
  res.json({ ok: true, bus });
});

exports.assignOwnerBusCrew = asyncHandler(async (req, res) => {
  const ownerId = req.user.userId;
  const { busId } = req.params;
  const { driverId, conductorId, activeFrom, activeTo } = req.body;
  if (!driverId || !conductorId) throw new ApiError(400, "driverId and conductorId required");

  const bus = await Bus.findOne({ _id: busId, ownerId }).select("crewPolicy currentLocation");
  if (!bus) throw new ApiError(404, "Bus not found in your fleet");
  if (String(bus.crewPolicy || "FLEXIBLE") !== "FIXED") {
    throw new ApiError(400, "Crew mapping is available only for fixed-crew buses");
  }

  const [driver, conductor] = await Promise.all([
    Driver.findOne({ _id: driverId, ownerId }).select("_id status"),
    Conductor.findOne({ _id: conductorId, ownerId }).select("_id status"),
  ]);
  if (!driver) throw new ApiError(404, "Driver not found in your fleet");
  if (!conductor) throw new ApiError(404, "Conductor not found in your fleet");
  if (String(driver.status) !== "Available") {
    throw new ApiError(400, "Driver is not available for assignment");
  }
  if (String(conductor.status) !== "Available") {
    throw new ApiError(400, "Conductor is not available for assignment");
  }

  await deactivateExpiredCrewMappings(new Date(), { busId });

  const mapping = await BusCrewMapping.findOne({ busId, driverId, conductorId, isActive: true });
  if (mapping) {
    await syncCrewLocationToBus({ bus, driverId, conductorId });
    return res.json({ ok: true, mapping });
  }

  const created = await BusCrewMapping.create({
    busId,
    driverId,
    conductorId,
    activeFrom: activeFrom || new Date(),
    activeTo: activeTo || null,
    isActive: true,
  });

  await syncCrewLocationToBus({ bus, driverId, conductorId });

  res.status(201).json({ ok: true, mapping: created });
});

exports.resetOwnerBusCrew = asyncHandler(async (req, res) => {
  const ownerId = req.user.userId;
  const { busId } = req.params;

  const bus = await Bus.findOne({ _id: busId, ownerId }).select("busNumber");
  if (!bus) throw new ApiError(404, "Bus not found in your fleet");

  const now = new Date();
  const result = await BusCrewMapping.updateMany(
    {
      busId: bus._id,
      isActive: true,
    },
    { $set: { isActive: false, activeTo: now } }
  );

  res.json({
    ok: true,
    bus: { id: bus._id, busNumber: bus.busNumber },
    updatedCount: result.modifiedCount || 0,
  });
});

exports.getOwnerAssignCrewContext = asyncHandler(async (req, res) => {
  const ownerId = req.user.userId;
  const date = String(req.query.date || toIsoDay(new Date()));
  const { start, end } = dayWindowFromIso(date);

  const buses = await loadOwnerBuses(ownerId);
  const busIds = buses.map((bus) => bus._id);
  if (busIds.length) await deactivateExpiredCrewMappings(start, { busId: { $in: busIds } });

  const [drivers, conductors, mappings] = await Promise.all([
    busIds.length
      ? Driver.find({ ownerId, status: "Available" }).select("name empId depotId status").lean()
      : [],
    busIds.length
      ? Conductor.find({ ownerId, status: "Available" }).select("name empId depotId status").lean()
      : [],
    busIds.length
      ? BusCrewMapping.find({
          busId: { $in: busIds },
          isActive: true,
          activeFrom: { $lt: end },
          $or: [{ activeTo: null }, { activeTo: { $gte: start } }],
        })
          .populate("busId", "busNumber")
          .populate("driverId", "name empId")
          .populate("conductorId", "name empId")
          .sort({ updatedAt: -1 })
          .lean()
      : [],
  ]);

  const seenBus = new Set();
  const assignments = [];
  for (const mapping of mappings) {
    const busKey = String(mapping.busId?._id || mapping.busId || "");
    if (!busKey || seenBus.has(busKey)) continue;
    seenBus.add(busKey);
    assignments.push({
      id: mapping._id,
      busId: busKey,
      busNumber: mapping.busId?.busNumber || "--",
      driver: mapping.driverId
        ? { id: mapping.driverId._id, name: mapping.driverId.name, empId: mapping.driverId.empId }
        : null,
      conductor: mapping.conductorId
        ? { id: mapping.conductorId._id, name: mapping.conductorId.name, empId: mapping.conductorId.empId }
        : null,
      activeFrom: mapping.activeFrom,
      activeTo: mapping.activeTo,
    });
  }

  res.json({
    ok: true,
    date,
    buses: buses.map((bus) => ({
      id: bus._id,
      busNumber: bus.busNumber,
      status: bus.status,
      operatorType: bus.operatorType || "WBTC",
      depotId: bus.depotId?._id || null,
      depotName: bus.depotId?.depotName || "--",
      depotCode: bus.depotId?.depotCode || "--",
    })),
    drivers: drivers.map((driver) => ({
      id: driver._id,
      name: driver.name,
      empId: driver.empId,
      depotId: driver.depotId,
      status: driver.status,
    })),
    conductors: conductors.map((conductor) => ({
      id: conductor._id,
      name: conductor.name,
      empId: conductor.empId,
      depotId: conductor.depotId,
      status: conductor.status,
    })),
    assignments,
  });
});

exports.assignOwnerDailyCrew = asyncHandler(async (req, res) => {
  const ownerId = req.user.userId;
  const { busId, driverId, conductorId, date } = req.body;
  if (!busId || !driverId || !conductorId) throw new ApiError(400, "busId, driverId and conductorId are required");

  const targetDate = String(date || toIsoDay(new Date()));
  const { start, end } = dayWindowFromIso(targetDate);

  const bus = await Bus.findOne({ _id: busId, ownerId }).select("busNumber depotId currentLocation");
  if (!bus) throw new ApiError(404, "Bus not found in your fleet");

  const [driver, conductor] = await Promise.all([
    Driver.findById(driverId).select("name empId depotId status ownerId"),
    Conductor.findById(conductorId).select("name empId depotId status ownerId"),
  ]);
  if (!driver) throw new ApiError(404, "Driver not found");
  if (!conductor) throw new ApiError(404, "Conductor not found");
  if (String(driver.ownerId || "") !== String(ownerId) || String(conductor.ownerId || "") !== String(ownerId)) {
    throw new ApiError(403, "Driver and conductor must belong to your fleet");
  }
  if (String(driver.status) !== "Available" || String(conductor.status) !== "Available") {
    throw new ApiError(400, "Only available staff can be assigned");
  }

  await deactivateExpiredCrewMappings(start, { busId: bus._id });

  const depotId = String(bus.depotId || "");
  if (depotId && (String(driver.depotId || "") !== depotId || String(conductor.depotId || "") !== depotId)) {
    throw new ApiError(400, "Driver and conductor must belong to bus depot");
  }

  const [driverConflict, conductorConflict] = await Promise.all([
    BusCrewMapping.findOne({
      busId: { $ne: bus._id },
      driverId,
      isActive: true,
      activeFrom: { $lt: end },
      $or: [{ activeTo: null }, { activeTo: { $gte: start } }],
    }).populate("busId", "busNumber"),
    BusCrewMapping.findOne({
      busId: { $ne: bus._id },
      conductorId,
      isActive: true,
      activeFrom: { $lt: end },
      $or: [{ activeTo: null }, { activeTo: { $gte: start } }],
    }).populate("busId", "busNumber"),
  ]);

  if (driverConflict) {
    throw new ApiError(409, `Driver already assigned to bus ${driverConflict.busId?.busNumber || "--"} for ${targetDate}`);
  }
  if (conductorConflict) {
    throw new ApiError(
      409,
      `Conductor already assigned to bus ${conductorConflict.busId?.busNumber || "--"} for ${targetDate}`
    );
  }

  const existingForBus = await BusCrewMapping.find({
    busId: bus._id,
    isActive: true,
    activeFrom: { $lt: end },
    $or: [{ activeTo: null }, { activeTo: { $gte: start } }],
  }).select("_id");
  if (existingForBus.length) {
    await BusCrewMapping.updateMany(
      { _id: { $in: existingForBus.map((item) => item._id) } },
      { $set: { isActive: false, activeTo: start } }
    );
  }

  const mapping = await BusCrewMapping.create({
    busId: bus._id,
    driverId: driver._id,
    conductorId: conductor._id,
    activeFrom: start,
    activeTo: end,
    isActive: true,
  });

  await syncCrewLocationToBus({ bus, driverId: driver._id, conductorId: conductor._id });

  res.status(201).json({
    ok: true,
    date: targetDate,
    assignment: {
      id: mapping._id,
      bus: { id: bus._id, busNumber: bus.busNumber },
      driver: { id: driver._id, name: driver.name, empId: driver.empId },
      conductor: { id: conductor._id, name: conductor.name, empId: conductor.empId },
      activeFrom: mapping.activeFrom,
      activeTo: mapping.activeTo,
    },
  });
});

exports.getOwnerPaymentSummary = asyncHandler(async (req, res) => {
  const ownerId = req.user.userId;
  const mode = String(req.query.mode || "monthly").toLowerCase();
  const { start, end } = getPeriodWindow(mode, req.query);
  const period = {
    startDate: toIsoDay(start),
    endDate: toIsoDay(new Date(end.getTime() - 1)),
  };

  const rows = await computeOwnerPaymentRows({ ownerIds: [ownerId], start, end });
  const summary = rows[String(ownerId)] || {
    totalBuses: 0,
    ticketsGenerated: 0,
    payableAmount: 0,
    commissionAmount: 0,
    paidAmount: 0,
    dueAmount: 0,
  };

  res.json({
    ok: true,
    mode,
    period,
    summary,
  });
});
