const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const ApiError = require("./utils/ApiError");
const errorHandler = require("./middleware/errorHandler");

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
  "https://wbtc-rose.vercel.app",
];

const parseAllowedOrigins = () =>
  String(process.env.CORS_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const isAllowedDevelopmentOrigin = (origin) =>
  origin.startsWith("http://localhost:") ||
  origin.startsWith("http://127.0.0.1:") ||
  origin.startsWith("http://192.168.") ||
  origin.startsWith("http://10.") ||
  origin.startsWith("http://172.");

const buildCorsOriginChecker = () => {
  const allowedOrigins = parseAllowedOrigins();
  const isDevelopment = process.env.NODE_ENV !== "production";

  return (origin, callback) => {
    // Native mobile apps and non-browser clients often omit Origin entirely.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (isDevelopment && isAllowedDevelopmentOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new ApiError(403, "Origin not allowed by CORS policy"));
  };
};

const corsOptions = {
  origin: buildCorsOriginChecker(),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(helmet());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      if (req.originalUrl.includes("/api/public/payments/razorpay/webhook")) {
        req.rawBody = buf.toString();
      }
    },
  })
);
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({ ok: true, service: "WBTC Fleet Backend" });
});

/**
 * ⚠️ TEMPORARILY COMMENT ROUTES
 * We will add them back one by one
 */

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/passenger-auth", require("./routes/passengerAuth.routes"));
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
