const mongoose = require("mongoose");
const Bus = require("../models/Bus");
const TicketBooking = require("../models/TicketBooking");
const OwnerPaymentSettlement = require("../models/OwnerPaymentSettlement");
const ApiError = require("./ApiError");
const { getOpsDate, getOpsMonth, getOpsPeriodWindow } = require("./opsTime");

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

const computeOwnerPaymentRows = async ({ ownerIds, start, end }) => {
  const ownerObjectIds = toObjectIds(ownerIds);
  if (!ownerObjectIds.length) return {};

  const buses = await Bus.find({ ownerId: { $in: ownerObjectIds } }).select("busNumber ownerId").lean();
  const busNumberOwnerMap = {};
  const ownerBusCounts = {};
  for (const bus of buses) {
    const busNumber = String(bus.busNumber || "");
    const ownerId = String(bus.ownerId || "");
    if (!busNumber || !ownerId) continue;
    busNumberOwnerMap[busNumber] = ownerId;
    ownerBusCounts[ownerId] = (ownerBusCounts[ownerId] || 0) + 1;
  }

  const busNumbers = Object.keys(busNumberOwnerMap);
  const ticketRows = busNumbers.length
    ? await TicketBooking.aggregate([
        {
          $match: {
            status: "PAID",
            busNumber: { $in: busNumbers },
            bookedAt: { $gte: start, $lt: end },
          },
        },
        {
          $group: {
            _id: "$busNumber",
            tickets: { $sum: { $ifNull: ["$passengerCount", 1] } },
            fare: { $sum: { $ifNull: ["$fare", 0] } },
          },
        },
      ])
    : [];

  const ownerPayments = {};
  for (const row of ticketRows) {
    const busNumber = String(row._id || "");
    const ownerId = busNumberOwnerMap[busNumber];
    if (!ownerId) continue;
    if (!ownerPayments[ownerId]) ownerPayments[ownerId] = { tickets: 0, payableAmount: 0 };
    ownerPayments[ownerId].tickets += row.tickets || 0;
    ownerPayments[ownerId].payableAmount += row.fare || 0;
  }

  const settlementRows = await OwnerPaymentSettlement.aggregate([
    {
      $match: {
        ownerId: { $in: ownerObjectIds },
        status: "SUCCESS",
        // Include settlements that belong to the selected period window.
        // Virtual payments are stored with periodEnd equal to the window end.
        periodStart: { $gte: start, $lt: end },
        periodEnd: { $gt: start, $lte: end },
      },
    },
    {
      $group: {
        _id: "$ownerId",
        settledGrossAmount: { $sum: { $ifNull: ["$grossDueAmount", 0] } },
        paidAmount: { $sum: { $ifNull: ["$netPaidAmount", 0] } },
        commissionAmount: { $sum: { $ifNull: ["$commissionAmount", 0] } },
      },
    },
  ]);

  const settlementsByOwner = settlementRows.reduce((acc, row) => {
    acc[String(row._id)] = {
      settledGrossAmount: Number((row.settledGrossAmount || 0).toFixed(2)),
      paidAmount: Number((row.paidAmount || 0).toFixed(2)),
      commissionAmount: Number((row.commissionAmount || 0).toFixed(2)),
    };
    return acc;
  }, {});

  const mergedRows = {};
  for (const ownerId of ownerObjectIds.map((id) => String(id))) {
    const payment = ownerPayments[ownerId] || { tickets: 0, payableAmount: 0 };
    const settlement = settlementsByOwner[ownerId] || {
      settledGrossAmount: 0,
      paidAmount: 0,
      commissionAmount: 0,
    };
    const payableAmount = Number((payment.payableAmount || 0).toFixed(2));
    const dueAmount = Number(Math.max(payableAmount - settlement.settledGrossAmount, 0).toFixed(2));

    mergedRows[ownerId] = {
      ownerId,
      totalBuses: ownerBusCounts[ownerId] || 0,
      ticketsGenerated: payment.tickets || 0,
      payableAmount,
      settledGrossAmount: settlement.settledGrossAmount,
      paidAmount: settlement.paidAmount,
      commissionAmount: settlement.commissionAmount,
      dueAmount,
    };
  }

  return mergedRows;
};

module.exports = {
  toIsoDay,
  getPeriodWindow,
  computeOwnerPaymentRows,
};
