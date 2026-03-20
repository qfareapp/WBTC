const ApiError = require("./ApiError");

const OPS_TIMEZONE = "Asia/Kolkata";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const getOpsParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
};

const getOpsNowParts = () => {
  const parts = getOpsParts(new Date());
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    month: `${parts.year}-${parts.month}`,
    nowMinutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

const getOpsDate = () => getOpsNowParts().date;

const getOpsMonth = () => getOpsNowParts().month;

const toOpsIsoDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getOpsParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const toOpsMonthKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getOpsParts(date);
  return `${parts.year}-${parts.month}`;
};

const getOpsDayWindow = (isoDate) => {
  if (!DATE_RE.test(String(isoDate || ""))) throw new ApiError(400, "Invalid date. Use YYYY-MM-DD");
  const start = new Date(`${isoDate}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, "Invalid date. Use YYYY-MM-DD");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const getOpsMonthWindow = (month) => {
  if (!MONTH_RE.test(String(month || ""))) throw new ApiError(400, "Invalid month. Use YYYY-MM");
  const start = new Date(`${month}-01T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, "Invalid month. Use YYYY-MM");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
};

const getOpsPeriodWindow = (mode, query = {}) => {
  if (mode === "daily") {
    const date = String(query.date || getOpsDate());
    return getOpsDayWindow(date);
  }
  if (mode === "monthly") {
    const month = String(query.month || getOpsMonth());
    return getOpsMonthWindow(month);
  }
  if (mode === "custom") {
    const startDate = String(query.startDate || "");
    const endDate = String(query.endDate || "");
    const { start } = getOpsDayWindow(startDate);
    const { start: endStart } = getOpsDayWindow(endDate);
    if (start > endStart) throw new ApiError(400, "startDate must be <= endDate");
    const end = new Date(endStart);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  throw new ApiError(400, "mode must be daily, monthly, or custom");
};

const getOpsClockMinutes = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getOpsParts(date);
  return Number(parts.hour) * 60 + Number(parts.minute);
};

module.exports = {
  OPS_TIMEZONE,
  getOpsNowParts,
  getOpsDate,
  getOpsMonth,
  toOpsIsoDay,
  toOpsMonthKey,
  getOpsDayWindow,
  getOpsMonthWindow,
  getOpsPeriodWindow,
  getOpsClockMinutes,
};
