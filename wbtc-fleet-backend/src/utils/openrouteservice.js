/**
 * ETA calculation using OpenRouteService (free tier).
 *
 * Free tier limits: 2 000 requests/day, 40 req/minute.
 * No credit card required — sign up at https://openrouteservice.org/dev/#/api-docs
 *
 * Env vars:
 *   ORS_API_KEY   — your OpenRouteService API key.
 *                   If not set, falls back to the Haversine estimate.
 *
 * Haversine fallback:
 *   straight-line distance × 1.35 road-factor, 20 km/h average city-bus speed.
 *   Accurate to within ~20-30% for urban routes — good enough for "arrives in X min".
 */

const ORS_BASE = "https://api.openrouteservice.org/v2";

/** Great-circle distance in km between two lat/lng points. */
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Calculate driving ETA from (fromLat, fromLng) to (toLat, toLng).
 *
 * Returns:
 *   { durationMin: number, distanceKm: number, source: 'ors' | 'haversine' }
 */
const getDrivingEta = async (fromLat, fromLng, toLat, toLng) => {
  const apiKey = process.env.ORS_API_KEY;

  if (apiKey) {
    try {
      // ORS expects (lng, lat) order — note the swap
      const url =
        `${ORS_BASE}/directions/driving-car` +
        `?api_key=${apiKey}` +
        `&start=${fromLng},${fromLat}` +
        `&end=${toLng},${toLat}`;

      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const data = await response.json();
        const segment = data?.features?.[0]?.properties?.segments?.[0];
        if (segment) {
          return {
            durationMin: Math.ceil(segment.duration / 60),
            distanceKm: parseFloat((segment.distance / 1000).toFixed(1)),
            source: "ors",
          };
        }
      }
    } catch {
      // fall through to Haversine
    }
  }

  // Haversine fallback
  const straightKm = haversineKm(fromLat, fromLng, toLat, toLng);
  const roadKm = straightKm * 1.35; // road detour factor for Indian cities
  const durationMin = Math.max(1, Math.ceil((roadKm / 20) * 60)); // 20 km/h city bus
  return {
    durationMin,
    distanceKm: parseFloat(roadKm.toFixed(1)),
    source: "haversine",
  };
};

module.exports = { getDrivingEta };
