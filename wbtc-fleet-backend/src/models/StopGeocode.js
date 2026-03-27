const mongoose = require("mongoose");

/**
 * Cache for geocoded bus-stop locations.
 * Bus stops don't move, so we geocode once and cache forever.
 */
const StopGeocodeSchema = new mongoose.Schema(
  {
    stopName: { type: String, required: true, unique: true, index: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    displayName: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StopGeocode", StopGeocodeSchema);
