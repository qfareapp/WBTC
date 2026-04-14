const toNumberOrNull = (value) => {
  if (value === "" || value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toTrimmedOrNull = (value) => {
  const text = String(value || "").trim();
  return text || null;
};

const getDirectionalStopFields = (stop = {}, direction = "UP") => {
  const isDown = String(direction || "UP").toUpperCase() === "DOWN";
  const boardingPoint = isDown ? stop.downBoardingPointId : stop.upBoardingPointId;
  const boardingLatitude = toNumberOrNull(boardingPoint?.latitude);
  const boardingLongitude = toNumberOrNull(boardingPoint?.longitude);
  const boardingImage = toTrimmedOrNull(boardingPoint?.landmarkImageUrl);
  return {
    latitude:
      boardingLatitude != null
        ? boardingLatitude
        : isDown
        ? toNumberOrNull(stop.downLatitude)
        : toNumberOrNull(stop.upLatitude),
    longitude:
      boardingLongitude != null
        ? boardingLongitude
        : isDown
        ? toNumberOrNull(stop.downLongitude)
        : toNumberOrNull(stop.upLongitude),
    landmarkImageUrl:
      boardingImage ||
      (isDown
        ? toTrimmedOrNull(stop.downLandmarkImageUrl)
        : toTrimmedOrNull(stop.upLandmarkImageUrl)),
    towards: toTrimmedOrNull(boardingPoint?.towards) || (isDown ? toTrimmedOrNull(stop.downTowards) : toTrimmedOrNull(stop.upTowards)),
  };
};

const getLegacyStopFields = (stop = {}) => ({
  latitude: toNumberOrNull(stop.latitude),
  longitude: toNumberOrNull(stop.longitude),
  landmarkImageUrl: toTrimmedOrNull(stop.landmarkImageUrl),
});

const hasCoords = (coords) =>
  coords &&
  typeof coords.latitude === "number" &&
  typeof coords.longitude === "number";

const getStopFieldsForDirection = (stop = {}, direction = "UP") => {
  const directional = getDirectionalStopFields(stop, direction);
  if (hasCoords(directional) || directional.landmarkImageUrl) {
    return directional;
  }
  return getLegacyStopFields(stop);
};

const getPreferredStopFields = (stop = {}) => {
  const up = getDirectionalStopFields(stop, "UP");
  if (hasCoords(up) || up.landmarkImageUrl) return up;

  const down = getDirectionalStopFields(stop, "DOWN");
  if (hasCoords(down) || down.landmarkImageUrl) return down;

  return getLegacyStopFields(stop);
};

const serializeRouteStop = (stop = {}, direction = null) => {
  const preferred = getPreferredStopFields(stop);
  const directional = direction ? getStopFieldsForDirection(stop, direction) : preferred;

  return {
    ...stop,
    latitude: preferred.latitude,
    longitude: preferred.longitude,
    landmarkImageUrl: preferred.landmarkImageUrl,
    upLatitude: toNumberOrNull(stop.upLatitude),
    upLongitude: toNumberOrNull(stop.upLongitude),
    upTowards: toTrimmedOrNull(stop.upBoardingPointId?.towards) || toTrimmedOrNull(stop.upTowards),
    upLandmarkImageUrl: toTrimmedOrNull(stop.upLandmarkImageUrl),
    downLatitude: toNumberOrNull(stop.downLatitude),
    downLongitude: toNumberOrNull(stop.downLongitude),
    downTowards: toTrimmedOrNull(stop.downBoardingPointId?.towards) || toTrimmedOrNull(stop.downTowards),
    downLandmarkImageUrl: toTrimmedOrNull(stop.downLandmarkImageUrl),
    stopMasterId: stop.stopMasterId?._id || stop.stopMasterId || null,
    upBoardingPointId: stop.upBoardingPointId?._id || stop.upBoardingPointId || null,
    downBoardingPointId: stop.downBoardingPointId?._id || stop.downBoardingPointId || null,
    resolvedLatitude: directional.latitude,
    resolvedLongitude: directional.longitude,
    resolvedLandmarkImageUrl: directional.landmarkImageUrl,
    resolvedTowards: directional.towards || null,
    resolvedDirection: direction ? String(direction || "").toUpperCase() : null,
  };
};

module.exports = {
  getDirectionalStopFields,
  getLegacyStopFields,
  getPreferredStopFields,
  getStopFieldsForDirection,
  hasCoords,
  serializeRouteStop,
  toNumberOrNull,
  toTrimmedOrNull,
};
