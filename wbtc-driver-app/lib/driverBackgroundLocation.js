import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const DRIVER_LOCATION_TASK = "wbtc-driver-background-location";
const DRIVER_LOCATION_META_KEY = "wbtc_driver_background_location_meta";

const readTrackingMeta = async () => {
  try {
    const raw = await AsyncStorage.getItem(DRIVER_LOCATION_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const postDriverLocation = async (coords) => {
  const meta = await readTrackingMeta();
  if (!meta?.apiBase || !meta?.token || !meta?.tripInstanceId) return;

  await fetch(`${meta.apiBase}/api/driver-trips/location`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${meta.token}`,
    },
    body: JSON.stringify({
      tripInstanceId: meta.tripInstanceId,
      latitude: coords.latitude,
      longitude: coords.longitude,
    }),
  });
};

TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const latest = data?.locations?.[data.locations.length - 1];
  if (!latest?.coords) return;

  try {
    await postDriverLocation(latest.coords);
  } catch {
    // Non-fatal: background posts should retry on the next location event.
  }
});

export const requestDriverBackgroundPermissions = async () => {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") return { ok: false, reason: "foreground_denied" };

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") return { ok: false, reason: "background_denied" };

  return { ok: true };
};

export const startDriverBackgroundTracking = async ({ tripInstanceId, apiBase, token }) => {
  if (!tripInstanceId || !apiBase || !token) return false;

  await AsyncStorage.setItem(
    DRIVER_LOCATION_META_KEY,
    JSON.stringify({ tripInstanceId, apiBase, token })
  );

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  if (alreadyStarted) {
    return true;
  }

  await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000,
    distanceInterval: 30,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "WBTC driver trip live",
      notificationBody: "Tracking your trip location in the background.",
      notificationColor: "#0A1628",
    },
  });

  return true;
};

export const stopDriverBackgroundTracking = async () => {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    if (started) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } finally {
    await AsyncStorage.removeItem(DRIVER_LOCATION_META_KEY);
  }
};

export { DRIVER_LOCATION_TASK };
