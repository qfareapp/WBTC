const mongoose = require("mongoose");

const OwnerPaymentSettlementSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    periodStart: { type: Date, required: true, index: true },
    periodEnd: { type: Date, required: true, index: true },
    grossDueAmount: { type: Number, required: true, min: 0 },
    commissionAmount: { type: Number, required: true, min: 0, default: 0 },
    netPaidAmount: { type: Number, required: true, min: 0, default: 0 },
    gatewayMode: { type: String, enum: ["VIRTUAL"], default: "VIRTUAL", index: true },
    gatewayTxnRef: { type: String, default: null, index: true },
    status: { type: String, enum: ["SUCCESS", "FAILED"], default: "SUCCESS", index: true },
    notes: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

OwnerPaymentSettlementSchema.index({ ownerId: 1, periodStart: 1, periodEnd: 1, status: 1 });

module.exports = mongoose.model("OwnerPaymentSettlement", OwnerPaymentSettlementSchema);
