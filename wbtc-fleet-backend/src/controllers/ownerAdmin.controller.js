const User = require("../models/User");
const Bus = require("../models/Bus");
const Route = require("../models/Route");
const TripInstance = require("../models/TripInstance");
const OwnerPaymentSettlement = require("../models/OwnerPaymentSettlement");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { toIsoDay, getPeriodWindow, computeOwnerPaymentRows } = require("../utils/ownerPayments");

exports.listOwnersOverview = asyncHandler(async (req, res) => {
  const owners = await User.find({ role: "OWNER" })
    .select("name username active createdAt")
    .sort({ createdAt: -1 })
    .lean();

  if (!owners.length) {
    return res.json({ ok: true, owners: [] });
  }

  const ownerIds = owners.map((owner) => owner._id);
  const buses = await Bus.find({ ownerId: { $in: ownerIds } })
    .select("ownerId busNumber status operatorType depotId attachedRouteId")
    .populate("depotId", "depotName depotCode")
    .sort({ busNumber: 1 })
    .lean();

  const busesByOwner = buses.reduce((acc, bus) => {
    const key = String(bus.ownerId || "");
    if (!acc[key]) acc[key] = [];
    acc[key].push(bus);
    return acc;
  }, {});

  const busOwnerMap = buses.reduce((acc, bus) => {
    acc[String(bus._id)] = String(bus.ownerId || "");
    return acc;
  }, {});

  const busIds = buses.map((bus) => bus._id);
  let trips = [];
  if (busIds.length) {
    trips = await TripInstance.find({ busId: { $in: busIds } })
      .select("busId routeId")
      .lean();
  }

  const routeIdsFromTrips = trips.map((trip) => String(trip.routeId || "")).filter(Boolean);
  const routeIdsFromAttachments = buses.map((bus) => String(bus.attachedRouteId || "")).filter(Boolean);
  const routeIds = Array.from(new Set([...routeIdsFromTrips, ...routeIdsFromAttachments]));
  const routes = routeIds.length
    ? await Route.find({ _id: { $in: routeIds } }).select("routeCode routeName").lean()
    : [];
  const routeMap = routes.reduce((acc, route) => {
    acc[String(route._id)] = route;
    return acc;
  }, {});

  const ownerRouteSets = {};
  for (const bus of buses) {
    const ownerId = String(bus.ownerId || "");
    const routeId = String(bus.attachedRouteId || "");
    if (!ownerId || !routeId) continue;
    if (!ownerRouteSets[ownerId]) ownerRouteSets[ownerId] = new Set();
    ownerRouteSets[ownerId].add(routeId);
  }
  for (const trip of trips) {
    const ownerId = busOwnerMap[String(trip.busId || "")];
    if (!ownerId) continue;
    if (!ownerRouteSets[ownerId]) ownerRouteSets[ownerId] = new Set();
    ownerRouteSets[ownerId].add(String(trip.routeId || ""));
  }

  const payload = owners.map((owner) => {
    const ownerKey = String(owner._id);
    const ownerBuses = busesByOwner[ownerKey] || [];
    const routeSet = ownerRouteSets[ownerKey] || new Set();
    const ownerRoutes = Array.from(routeSet)
      .map((routeId) => ({
        id: routeId,
        routeCode: routeMap[routeId]?.routeCode || "--",
        routeName: routeMap[routeId]?.routeName || "Route",
      }))
      .sort((a, b) => String(a.routeCode).localeCompare(String(b.routeCode)));

    return {
      owner: {
        id: owner._id,
        name: owner.name,
        username: owner.username,
        active: owner.active,
        createdAt: owner.createdAt,
      },
      totalBuses: ownerBuses.length,
      totalRoutes: ownerRoutes.length,
      buses: ownerBuses.map((bus) => ({
        id: bus._id,
        busNumber: bus.busNumber,
        status: bus.status,
        operatorType: bus.operatorType || "WBTC",
        depotName: bus.depotId?.depotName || "--",
        depotCode: bus.depotId?.depotCode || "--",
      })),
      routes: ownerRoutes,
    };
  });

  res.json({ ok: true, owners: payload });
});

exports.getOwnerTagContext = asyncHandler(async (req, res) => {
  const [owners, buses] = await Promise.all([
    User.find({ role: "OWNER" }).select("name username active").sort({ name: 1 }).lean(),
    Bus.find({})
      .select("busNumber ownerId operatorType status depotId")
      .populate("depotId", "depotName depotCode")
      .sort({ busNumber: 1 })
      .lean(),
  ]);

  res.json({
    ok: true,
    owners: owners.map((owner) => ({
      id: owner._id,
      name: owner.name,
      username: owner.username,
      active: owner.active,
    })),
    buses: buses.map((bus) => ({
      id: bus._id,
      busNumber: bus.busNumber,
      ownerId: bus.ownerId || null,
      operatorType: bus.operatorType || "WBTC",
      status: bus.status,
      depotName: bus.depotId?.depotName || "--",
      depotCode: bus.depotId?.depotCode || "--",
    })),
  });
});

exports.listOwnerDuePayments = asyncHandler(async (req, res) => {
  const mode = String(req.query.mode || "monthly").toLowerCase();
  const { start, end } = getPeriodWindow(mode, req.query);
  const period = {
    startDate: toIsoDay(start),
    endDate: toIsoDay(new Date(end.getTime() - 1)),
  };

  const owners = await User.find({ role: "OWNER" }).select("name username").lean();
  if (!owners.length) {
    return res.json({
      ok: true,
      mode,
      period,
      summary: { owners: 0, tickets: 0, payableAmount: 0, paidAmount: 0, dueAmount: 0 },
      payments: [],
    });
  }

  const ownerMap = owners.reduce((acc, owner) => {
    acc[String(owner._id)] = owner;
    return acc;
  }, {});
  const ownerIds = Object.keys(ownerMap);
  const paymentRows = await computeOwnerPaymentRows({ ownerIds, start, end });

  const payments = ownerIds
    .map((ownerId) => {
      const owner = ownerMap[ownerId];
      if (!owner) return null;
      const row = paymentRows[ownerId] || {
        totalBuses: 0,
        ticketsGenerated: 0,
        payableAmount: 0,
        commissionAmount: 0,
        paidAmount: 0,
        dueAmount: 0,
      };
      return {
        owner: {
          id: owner._id,
          name: owner.name,
          username: owner.username,
        },
        totalBuses: row.totalBuses,
        ticketsGenerated: row.ticketsGenerated,
        payableAmount: row.payableAmount,
        commissionAmount: row.commissionAmount,
        paidAmount: row.paidAmount,
        dueAmount: row.dueAmount,
      };
    })
    .filter(Boolean)
    .filter((row) => row.payableAmount > 0 || row.paidAmount > 0 || row.dueAmount > 0)
    .sort((a, b) => b.dueAmount - a.dueAmount);

  const summary = payments.reduce(
    (acc, item) => {
      acc.owners += 1;
      acc.tickets += item.ticketsGenerated || 0;
      acc.payableAmount += item.payableAmount || 0;
      acc.paidAmount += item.paidAmount || 0;
      acc.dueAmount += item.dueAmount || 0;
      return acc;
    },
    { owners: 0, tickets: 0, payableAmount: 0, paidAmount: 0, dueAmount: 0 }
  );

  summary.payableAmount = Number(summary.payableAmount.toFixed(2));
  summary.paidAmount = Number(summary.paidAmount.toFixed(2));
  summary.dueAmount = Number(summary.dueAmount.toFixed(2));

  res.json({
    ok: true,
    mode,
    period,
    summary,
    payments,
  });
});

exports.virtualPayOwnerDue = asyncHandler(async (req, res) => {
  const { ownerId } = req.params;
  const mode = String(req.body.mode || "monthly").toLowerCase();
  const { start, end } = getPeriodWindow(mode, req.body);

  const owner = await User.findOne({ _id: ownerId, role: "OWNER" }).select("name username");
  if (!owner) throw new ApiError(404, "Owner not found");

  const rows = await computeOwnerPaymentRows({ ownerIds: [ownerId], start, end });
  const row = rows[String(ownerId)] || null;
  if (!row || row.dueAmount <= 0) throw new ApiError(400, "No due amount available for this owner in selected period");

  const commissionAmountRaw = Number(req.body.commissionAmount || 0);
  if (!Number.isFinite(commissionAmountRaw) || commissionAmountRaw < 0) {
    throw new ApiError(400, "commissionAmount must be a non-negative number");
  }
  const commissionAmount = Number(commissionAmountRaw.toFixed(2));
  if (commissionAmount > row.dueAmount) throw new ApiError(400, "commissionAmount cannot be greater than due amount");

  const grossDueAmount = row.dueAmount;
  const netPaidAmount = Number((grossDueAmount - commissionAmount).toFixed(2));

  const settlement = await OwnerPaymentSettlement.create({
    ownerId,
    periodStart: start,
    periodEnd: end,
    grossDueAmount,
    commissionAmount,
    netPaidAmount,
    gatewayMode: "VIRTUAL",
    gatewayTxnRef: `VTXN-${Date.now()}`,
    status: "SUCCESS",
    notes: "Virtual payment settlement",
    createdBy: req.user?.userId || null,
  });

  const updatedRows = await computeOwnerPaymentRows({ ownerIds: [ownerId], start, end });
  const updated = updatedRows[String(ownerId)] || row;

  res.status(201).json({
    ok: true,
    settlement: {
      id: settlement._id,
      ownerId: owner._id,
      ownerName: owner.name,
      period: {
        startDate: toIsoDay(start),
        endDate: toIsoDay(new Date(end.getTime() - 1)),
      },
      grossDueAmount: settlement.grossDueAmount,
      commissionAmount: settlement.commissionAmount,
      netPaidAmount: settlement.netPaidAmount,
      gatewayTxnRef: settlement.gatewayTxnRef,
      status: settlement.status,
      paidAt: settlement.createdAt,
    },
    updatedPayment: {
      totalBuses: updated.totalBuses,
      ticketsGenerated: updated.ticketsGenerated,
      payableAmount: updated.payableAmount,
      commissionAmount: updated.commissionAmount,
      paidAmount: updated.paidAmount,
      dueAmount: updated.dueAmount,
    },
  });
});

exports.getBusAttachedRoutes = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const bus = await Bus.findById(busId).select("busNumber attachedRouteId");
  if (!bus) throw new ApiError(404, "Bus not found");

  const routeIdsFromTrips = await TripInstance.distinct("routeId", { busId });
  const routeIds = Array.from(
    new Set(
      [...routeIdsFromTrips, bus.attachedRouteId]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  const routes = routeIds.length
    ? await Route.find({ _id: { $in: routeIds } }).select("routeCode routeName").sort({ routeCode: 1 }).lean()
    : [];

  res.json({
    ok: true,
    bus: { id: bus._id, busNumber: bus.busNumber },
    routes: routes.map((route) => ({
      id: route._id,
      routeCode: route.routeCode,
      routeName: route.routeName,
    })),
  });
});

exports.tagBusToOwner = asyncHandler(async (req, res) => {
  const { ownerId } = req.params;
  const { busId } = req.body;
  if (!busId) throw new ApiError(400, "busId required");

  const owner = await User.findOne({ _id: ownerId, role: "OWNER" }).select("_id name username");
  if (!owner) throw new ApiError(404, "Owner not found");

  const bus = await Bus.findById(busId).select("busNumber ownerId");
  if (!bus) throw new ApiError(404, "Bus not found");

  bus.ownerId = owner._id;
  await bus.save();

  res.json({
    ok: true,
    bus: {
      id: bus._id,
      busNumber: bus.busNumber,
      ownerId: bus.ownerId,
    },
    owner: {
      id: owner._id,
      name: owner.name,
      username: owner.username,
    },
  });
});
