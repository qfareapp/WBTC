const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const ApiError = require("./utils/ApiError");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({ ok: true, service: "WBTC Fleet Backend" });
});

/**
 * ⚠️ TEMPORARILY COMMENT ROUTES
 * We will add them back one by one
 */

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/driver-auth", require("./routes/driverAuth.routes"));
app.use("/api/conductor-auth", require("./routes/conductorAuth.routes"));
app.use("/api/depots", require("./routes/depot.routes"));
app.use("/api/buses", require("./routes/bus.routes"));
app.use("/api/bus-crew", require("./routes/busCrew.routes"));
app.use("/api/drivers", require("./routes/driver.routes"));
app.use("/api/conductors", require("./routes/conductor.routes"));
app.use("/api/routes", require("./routes/route.routes"));
app.use("/api/public", require("./routes/public.routes"));
// app.use("/api/trip-templates", require("./routes/tripTemplate.routes"));
// app.use("/api/daily-ops", require("./routes/dailyOps.routes"));
app.use("/api/trips", require("./routes/tripInstance.routes"));
app.use("/api/driver-trips", require("./routes/driverTrip.routes"));
app.use("/api/conductor-trips", require("./routes/conductorTrip.routes"));
app.use("/api/owner", require("./routes/owner.routes"));
app.use("/api/admin/owners", require("./routes/ownerAdmin.routes"));

// JSON 404 fallback so API clients never receive HTML error pages.
app.use((req, res, next) => next(new ApiError(404, "Route not found")));

// Centralized JSON error handler.
app.use(errorHandler);

module.exports = app;
