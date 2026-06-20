const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER", "OWNER"],
      default: "VIEWER",
      index: true,
    },
    phoneNumber: { type: String, default: "" },
    whatsappNumber: { type: String, default: "" },
    email: { type: String, default: "" },
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", default: null },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false, index: true },
    passwordUpdatedAt: { type: Date, default: null },
    passwordResetAt: { type: Date, default: null },
    payoutBankDetails: {
      accountHolderName: { type: String, default: "" },
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      ifscCode: { type: String, default: "" },
      branchName: { type: String, default: "" },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
