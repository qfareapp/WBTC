export const OPS_TIMEZONE = "Asia/Kolkata";

const getOpsParts = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  return parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
};

export const getOpsDate = () => {
  const parts = getOpsParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getOpsNowMinutes = () => {
  const parts = getOpsParts();
  return Number(parts.hour) * 60 + Number(parts.minute);
};
