const mongoose = require("mongoose");

const StopMasterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, unique: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StopMaster", StopMasterSchema);
