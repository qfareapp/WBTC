const mongoose = require("mongoose");
const Bus = require("../models/Bus");
const Route = require("../models/Route");
const TicketBooking = require("../models/TicketBooking");
const TripInstance = require("../models/TripInstance");
const OwnerPaymentSettlement = require("../models/OwnerPaymentSettlement");
const ApiError = require("./ApiError");
const { getOpsDate, getOpsMonth, getOpsPeriodWindow, toOpsIsoDay } = require("./opsTime");

const getPeriodWindow = (mode, query) => {
  if (mode === "daily") {
    return getOpsPeriodWindow("daily", { date: query.date || getOpsDate() });
  }
  if (mode === "monthly") {
    return getOpsPeriodWindow("monthly", { month: query.month || getOpsMonth() });
  }
  if (mode === "custom") {
    return getOpsPeriodWindow("custom", query);
  }
  throw new ApiError(400, "mode must be daily, monthly, or custom");
};

const toObjectIds = (ids) =>
  (ids || [])
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

const roundMoney = (value) => Number((Number(value) || 0).toFixed(2));

const createEmptyMetrics = () => ({
  bookingsCount: 0,
  passengersCount: 0,
  onlineBookingsCount: 0,
  onlinePassengersCount: 0,
  cashBookingsCount: 0,
  cashPassengersCount: 0,
  onlineAmount: 0,
  cashAmount: 0,
  totalAmount: 0,
});

const addTicketToMetrics = (metrics, ticket) => {
  const passengers = Math.max(1, Number(ticket.passengerCount) || 1);
  const fare = Number(ticket.fare) || 0;
  const mode = String(ticket.paymentMode || "ONLINE").toUpperCase() === "CASH" ? "CASH" : "ONLINE";

  metrics.bookingsCount += 1;
  metrics.passengersCount += passengers;
  metrics.totalAmount += fare;

  if (mode === "CASH") {
    metrics.cashBookingsCount += 1;
    metrics.cashPassengersCount += passengers;
    metrics.cashAmount += fare;
  } else {
    metrics.onlineBookingsCount += 1;
    metrics.onlinePassengersCount += passengers;
    metrics.onlineAmount += fare;
  }
};

const finalizeMetrics = (metrics) => ({
  bookingsCount: metrics.bookingsCount,
  passengersCount: metrics.passengersCount,
  onlineBookingsCount: metrics.onlineBookingsCount,
  onlinePassengersCount: metrics.onlinePassengersCount,
  cashBookingsCount: metrics.cashBookingsCount,
  cashPassengersCount: metrics.cashPassengersCount,
  onlineAmount: roundMoney(metrics.onlineAmount),
  cashAmount: roundMoney(metrics.cashAmount),
  totalAmount: roundMoney(metrics.totalAmount),
});

const getOwnerBusMaps = async (ownerIds) => {
  const ownerObjectIds = toObjectIds(ownerIds);
  if (!ownerObjectIds.length) {
    return {
      ownerObjectIds,
      ownerBusCounts: {},
      busNumberOwnerMap: {},
      busIdOwnerMap: {},
      busNumberBusIdMap: {},
    };
  }

  const buses = await Bus.find({ ownerId: { $in: ownerObjectIds } }).select("_id busNumber ownerId").lean();
  const ownerBusCounts = {};
  const busNumberOwnerMap = {};
  const busIdOwnerMap = {};
  const busNumberBusIdMap = {};

  for (const bus of buses) {
    const ownerId = String(bus.ownerId || "");
    const busId = String(bus._id || "");
    const busNumber = String(bus.busNumber || "");
    if (!ownerId || !busId) continue;

    ownerBusCounts[ownerId] = (ownerBusCounts[ownerId] || 0) + 1;
    busIdOwnerMap[busId] = ownerId;
    if (busNumber) {
      busNumberOwnerMap[busNumber] = ownerId;
      busNumberBusIdMap[busNumber] = busId;
    }
  }

  return {
    ownerObjectIds,
    ownerBusCounts,
    busNumberOwnerMap,
    busIdOwnerMap,
    busNumberBusIdMap,
  };
};

const loadOwnerTickets = async ({ ownerIds, start, end }) => {
  const {
    ownerObjectIds,
    ownerBusCounts,
    busNumberOwnerMap,
    busIdOwnerMap,
    busNumberBusIdMap,
  } = await getOwnerBusMaps(ownerIds);

  if (!ownerObjectIds.length) {
    return {
      ownerObjectIds,
      ownerBusCounts,
      tickets: [],
    };
  }

  const busNumbers = Object.keys(busNumberOwnerMap);
  const busObjectIds = Object.keys(busIdOwnerMap)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));
  const ticketQuery = {
    status: "PAID",
    bookedAt: { $gte: start, $lt: end },
    $or: [
      { ownerId: { $in: ownerObjectIds } },
      ...(busObjectIds.length ? [{ busId: { $in: busObjectIds } }] : []),
      ...(busNumbers.length ? [{ busNumber: { $in: busNumbers } }] : []),
    ],
  };

  const rawTickets = await TicketBooking.find(ticketQuery)
    .select("ownerId busId busNumber tripInstanceId fare passengerCount paymentMode bookedAt")
    .lean();

  const ownerIdSet = new Set(ownerObjectIds.map((id) => String(id)));
  const tickets = rawTickets
    .map((ticket) => {
      const ownerId =
        String(ticket.ownerId || "") ||
        busIdOwnerMap[String(ticket.busId || "")] ||
        busNumberOwnerMap[String(ticket.busNumber || "")] ||
        "";
      if (!ownerIdSet.has(ownerId)) return null;

      const busId = String(ticket.busId || "") || busNumberBusIdMap[String(ticket.busNumber || "")] || null;
      return {
        ...ticket,
        ownerId,
        busId,
        busNumber: String(ticket.busNumber || ""),
        tripInstanceId: ticket.tripInstanceId ? String(ticket.tripInstanceId) : null,
        bookedDate: toOpsIsoDay(ticket.bookedAt),
      };
    })
    .filter(Boolean);

  return {
    ownerObjectIds,
    ownerBusCounts,
    tickets,
  };
};

const loadSettlementRows = async ({ ownerIds, start, end }) => {
  const ownerObjectIds = toObjectIds(ownerIds);
  if (!ownerObjectIds.length) return [];

  return OwnerPaymentSettlement.find({
    ownerId: { $in: ownerObjectIds },
    status: "SUCCESS",
    periodStart: { $lt: end },
    periodEnd: { $gt: start },
  })
    .sort({ createdAt: -1 })
    .lean();
};

const summarizeSettlementsByOwner = (rows = []) =>
  rows.reduce((acc, row) => {
    const ownerId = String(row.ownerId || "");
    if (!ownerId) return acc;

    if (!acc[ownerId]) {
      acc[ownerId] = {
        settledGrossAmount: 0,
        paidAmount: 0,
        commissionAmount: 0,
      };
    }

    acc[ownerId].settledGrossAmount += Number(row.grossDueAmount) || 0;
    acc[ownerId].paidAmount += Number(row.netPaidAmount) || 0;
    acc[ownerId].commissionAmount += Number(row.commissionAmount) || 0;
    return acc;
  }, {});

const computeOwnerPaymentRows = async ({ ownerIds, start, end }) => {
  const { ownerObjectIds, ownerBusCounts, tickets } = await loadOwnerTickets({ ownerIds, start, end });
  const settlementsByOwner = summarizeSettlementsByOwner(
    await loadSettlementRows({ ownerIds, start, end })
  );

  const mergedRows = {};
  for (const ownerId of ownerObjectIds.map((id) => String(id))) {
    const metrics = createEmptyMetrics();
    for (const ticket of tickets) {
      if (ticket.ownerId === ownerId) addTicketToMetrics(metrics, ticket);
    }

    const summary = finalizeMetrics(metrics);
    const settlement = settlementsByOwner[ownerId] || {
      settledGrossAmount: 0,
      paidAmount: 0,
      commissionAmount: 0,
    };
    const payableAmount = summary.onlineAmount;
    const dueAmount = roundMoney(Math.max(payableAmount - settlement.settledGrossAmount, 0));

    mergedRows[ownerId] = {
      ownerId,
      totalBuses: ownerBusCounts[ownerId] || 0,
      ticketsGenerated: summary.passengersCount,
      bookingsCount: summary.bookingsCount,
      onlineTicketsGenerated: summary.onlinePassengersCount,
      onlineBookingsCount: summary.onlineBookingsCount,
      onlineAmount: summary.onlineAmount,
      cashTicketsGenerated: summary.cashPassengersCount,
      cashBookingsCount: summary.cashBookingsCount,
      cashAmount: summary.cashAmount,
      totalAmount: summary.totalAmount,
      payableAmount,
      settledGrossAmount: roundMoney(settlement.settledGrossAmount),
      paidAmount: roundMoney(settlement.paidAmount),
      commissionAmount: roundMoney(settlement.commissionAmount),
      dueAmount,
    };
  }

  return mergedRows;
};

const computeOwnerPaymentDetails = async ({ ownerId, start, end }) => {
  const ownerKey = String(ownerId || "").trim();
  if (!ownerKey) throw new ApiError(400, "ownerId required");

  const { ownerBusCounts, tickets } = await loadOwnerTickets({ ownerIds: [ownerKey], start, end });
  const settlements = await loadSettlementRows({ ownerIds: [ownerKey], start, end });
  const settlementsByOwner = summarizeSettlementsByOwner(settlements);
  const ownerSummaryRow = (await computeOwnerPaymentRows({ ownerIds: [ownerKey], start, end }))[ownerKey] || {
    ownerId: ownerKey,
    totalBuses: ownerBusCounts[ownerKey] || 0,
    ticketsGenerated: 0,
    bookingsCount: 0,
    onlineTicketsGenerated: 0,
    onlineBookingsCount: 0,
    onlineAmount: 0,
    cashTicketsGenerated: 0,
    cashBookingsCount: 0,
    cashAmount: 0,
    totalAmount: 0,
    payableAmount: 0,
    settledGrossAmount: 0,
    paidAmount: 0,
    commissionAmount: 0,
    dueAmount: 0,
  };

  const dateBuckets = {};
  const tripBuckets = {};

  for (const ticket of tickets) {
    const dateKey = ticket.bookedDate || "--";
    if (!dateBuckets[dateKey]) {
      dateBuckets[dateKey] = {
        date: dateKey,
        tripIds: new Set(),
        metrics: createEmptyMetrics(),
      };
    }
    addTicketToMetrics(dateBuckets[dateKey].metrics, ticket);
    if (ticket.tripInstanceId) dateBuckets[dateKey].tripIds.add(ticket.tripInstanceId);

    const tripKey = ticket.tripInstanceId || `unassigned:${dateKey}:${ticket.busNumber || "NA"}`;
    if (!tripBuckets[tripKey]) {
      tripBuckets[tripKey] = {
        tripInstanceId: ticket.tripInstanceId,
        busNumber: ticket.busNumber || "--",
        metrics: createEmptyMetrics(),
      };
    }
    addTicketToMetrics(tripBuckets[tripKey].metrics, ticket);
  }

  const tripIds = Array.from(
    new Set(
      Object.values(tripBuckets)
        .map((bucket) => bucket.tripInstanceId)
        .filter(Boolean)
    )
  );
  const trips = tripIds.length
    ? await TripInstance.find({ _id: { $in: tripIds } })
        .select("date startTime endTime status direction routeId busId")
        .populate("routeId", "routeCode routeName source destination")
        .populate("busId", "busNumber")
        .lean()
    : [];
  const tripMap = trips.reduce((acc, trip) => {
    acc[String(trip._id)] = trip;
    return acc;
  }, {});

  const routeIds = Array.from(
    new Set(
      trips
        .map((trip) => String(trip.routeId?._id || trip.routeId || ""))
        .filter(Boolean)
    )
  );
  const routes = routeIds.length
    ? await Route.find({ _id: { $in: routeIds } }).select("routeCode routeName source destination").lean()
    : [];
  const routeMap = routes.reduce((acc, route) => {
    acc[String(route._id)] = route;
    return acc;
  }, {});

  const dateRows = Object.values(dateBuckets)
    .map((bucket) => ({
      date: bucket.date,
      tripCount: bucket.tripIds.size,
      ...finalizeMetrics(bucket.metrics),
    }))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));

  const tripRows = Object.values(tripBuckets)
    .map((bucket) => {
      const trip = bucket.tripInstanceId ? tripMap[bucket.tripInstanceId] || null : null;
      const route = trip ? routeMap[String(trip.routeId?._id || trip.routeId || "")] || trip.routeId || null : null;
      return {
        tripInstanceId: bucket.tripInstanceId,
        tripDate: trip?.date || null,
        tripWindow:
          trip && (trip.startTime || trip.endTime)
            ? `${trip.startTime || "--"} - ${trip.endTime || "--"}`
            : null,
        tripStatus: trip?.status || null,
        direction: trip?.direction || null,
        busNumber: trip?.busId?.busNumber || bucket.busNumber || "--",
        routeCode: route?.routeCode || "--",
        routeName: route?.routeName || "Route",
        source: route?.source || "--",
        destination: route?.destination || "--",
        ...finalizeMetrics(bucket.metrics),
      };
    })
    .sort((left, right) => {
      const dateDiff = String(right.tripDate || "").localeCompare(String(left.tripDate || ""));
      if (dateDiff !== 0) return dateDiff;
      return String(left.tripWindow || "").localeCompare(String(right.tripWindow || ""));
    });

  const settlementHistory = settlements.map((row) => ({
    id: row._id,
    periodStart: toOpsIsoDay(row.periodStart),
    periodEnd: toOpsIsoDay(new Date(new Date(row.periodEnd).getTime() - 1)),
    grossDueAmount: roundMoney(row.grossDueAmount),
    commissionAmount: roundMoney(row.commissionAmount),
    netPaidAmount: roundMoney(row.netPaidAmount),
    gatewayMode: row.gatewayMode || "VIRTUAL",
    gatewayTxnRef: row.gatewayTxnRef || null,
    status: row.status || "SUCCESS",
    notes: row.notes || "",
    createdAt: row.createdAt,
  }));

  return {
    summary: ownerSummaryRow,
    dateRows,
    tripRows,
    settlementHistory,
    settlementTotals: {
      settledGrossAmount: roundMoney(settlementsByOwner[ownerKey]?.settledGrossAmount || 0),
      paidAmount: roundMoney(settlementsByOwner[ownerKey]?.paidAmount || 0),
      commissionAmount: roundMoney(settlementsByOwner[ownerKey]?.commissionAmount || 0),
    },
  };
};

module.exports = {
  getPeriodWindow,
  toIsoDay: toOpsIsoDay,
  computeOwnerPaymentRows,
  computeOwnerPaymentDetails,
};
