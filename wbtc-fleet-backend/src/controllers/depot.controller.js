const Depot = require("../models/Depot");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

exports.createDepot = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    operatorType: req.body.operatorType || "WBTC",
  };
  const depot = await Depot.create(payload);
  res.status(201).json({ ok: true, depot });
});

exports.listDepots = asyncHandler(async (req, res) => {
  const operatorType = req.query.operatorType;
  const query = {};
  if (operatorType) {
    query.$or = [{ operatorType }, ...(operatorType === "WBTC" ? [{ operatorType: { $exists: false } }] : [])];
  }
  const depots = await Depot.find(query).sort({ depotName: 1 });
  res.json({ ok: true, depots });
});

exports.getDepot = asyncHandler(async (req, res) => {
  const depot = await Depot.findById(req.params.id);
  if (!depot) throw new ApiError(404, "Depot not found");
  res.json({ ok: true, depot });
});
