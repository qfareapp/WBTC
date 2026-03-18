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
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: "Depot", default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
