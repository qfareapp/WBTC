/**
 * Nominatim geocoding helpers (OpenStreetMap — free, no API key needed).
 *
 * Usage policy: max 1 req/second, must send a User-Agent identifying your app.
 * Our conductor location updates happen every 30 s, so this is well within limits.
 *
 * Env vars:
 *   NOMINATIM_USER_AGENT   — identifies your app (required by OSM policy)
 *   GEOCODE_CITY_CONTEXT   — prepended to stop names for forward geocoding
 *                            Default: "Kolkata, West Bengal, India"
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || "WBTCFleetApp/1.0 (fleet@wbtc.gov.in)";
const GEO_CONTEXT =
  process.env.GEOCODE_CITY_CONTEXT || "Kolkata, West Bengal, India";

const HEADERS = { "User-Agent": USER_AGENT, "Accept-Language": "en" };

/**
 * Build a short, human-readable place name from Nominatim address parts.
 * e.g. "Park Street, Kolkata" instead of the full display_name string.
 */
const shortName = (data) => {
  if (!data?.address) return null;
  const {
    road, suburb, quarter, city_district,
    city, town, village, county, state,
  } = data.address;
  const area = road || suburb || quarter || city_district || county || null;
  const locality = city || town || village || state || null;
  if (area && locality) return `${area}, ${locality}`;
  if (area) return area;
  if (locality) return locality;
  // fall back to first two comma-parts of the full display_name
  const parts = (data.display_name || "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, 2).join(", ") || null;
};

/**
 * Reverse geocode lat/lng → readable place name.
 * Returns a string like "Park Street, Kolkata" or null on failure.
 */
const reverseGeocode = async (latitude, longitude) => {
  try {
    const url = `${NOMINATIM_BASE}/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`;
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return shortName(data);
  } catch {
    return null;
  }
};

/**
 * Forward geocode a stop name → { lat, lng, displayName } or null.
 * Appends GEO_CONTEXT to improve accuracy for local bus stops.
 */
const forwardGeocode = async (stopName, context = GEO_CONTEXT) => {
  try {
    const q = encodeURIComponent(`${stopName}, ${context}`);
    const url = `${NOMINATIM_BASE}/search?q=${q}&format=json&limit=1&addressdetails=1`;
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.[0]) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name || null,
    };
  } catch {
    return null;
  }
};

module.exports = { reverseGeocode, forwardGeocode };
