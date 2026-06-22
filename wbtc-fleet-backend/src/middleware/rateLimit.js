const ApiError = require("../utils/ApiError");

const stores = new Map();

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
};

const getStore = (name) => {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name);
};

const pruneExpiredEntries = (store, now) => {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
};

const createRateLimit = ({
  name,
  windowMs,
  max,
  keyGenerator,
  message = "Too many requests. Please try again later.",
}) => {
  if (!name) {
    throw new Error("Rate limiter requires a name.");
  }

  return (req, _res, next) => {
    const now = Date.now();
    const store = getStore(name);
    pruneExpiredEntries(store, now);

    const key = keyGenerator ? keyGenerator(req) : getClientIp(req);
    const normalizedKey = String(key || "unknown");
    const entry = store.get(normalizedKey);

    if (!entry || entry.resetAt <= now) {
      store.set(normalizedKey, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      return next(new ApiError(429, message));
    }

    entry.count += 1;
    store.set(normalizedKey, entry);
    next();
  };
};

module.exports = {
  createRateLimit,
  getClientIp,
};
