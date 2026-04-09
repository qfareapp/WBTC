import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const DRIVER_LOCATION_TASK = "wbtc-driver-background-location";
const DRIVER_LOCATION_META_KEY = "wbtc_driver_background_location_meta";
const DRIVER_LOCATION_DEBUG_KEY = "wbtc_driver_background_location_debug";
const DEFAULT_NOTIFICATION_TITLE = "Trip in progress";
const DEFAULT_NOTIFICATION_BODY = "Live trip tracking is active in the background.";

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

  const response = await fetch(`${meta.apiBase}/api/driver-trips/location`, {
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

  await AsyncStorage.setItem(
    DRIVER_LOCATION_DEBUG_KEY,
    JSON.stringify({
      lastPostAt: new Date().toISOString(),
      source: "background",
      ok: response.ok,
      status: response.status,
      latitude: coords.latitude,
      longitude: coords.longitude,
    })
  );
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
  return startDriverBackgroundTrackingWithNotification({
    tripInstanceId,
    apiBase,
    token,
    notificationTitle: DEFAULT_NOTIFICATION_TITLE,
    notificationBody: DEFAULT_NOTIFICATION_BODY,
  });
};

export const startDriverBackgroundTrackingWithNotification = async ({
  tripInstanceId,
  apiBase,
  token,
  notificationTitle = DEFAULT_NOTIFICATION_TITLE,
  notificationBody = DEFAULT_NOTIFICATION_BODY,
}) => {
  if (!tripInstanceId || !apiBase || !token) return false;

  const nextMeta = {
    tripInstanceId,
    apiBase,
    token,
    notificationTitle,
    notificationBody,
  };
  const existingMeta = await readTrackingMeta();
  await AsyncStorage.setItem(
    DRIVER_LOCATION_META_KEY,
    JSON.stringify(nextMeta)
  );

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  const notificationChanged =
    existingMeta?.notificationTitle !== notificationTitle ||
    existingMeta?.notificationBody !== notificationBody;

  if (alreadyStarted && notificationChanged) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  } else if (alreadyStarted) {
    return true;
  }

  await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000,
    distanceInterval: 30,
    pausesUpdatesAutomatically: false,
    deferredUpdatesInterval: 15000,
    deferredUpdatesDistance: 30,
    foregroundService: {
      notificationTitle,
      notificationBody,
      notificationColor: "#0A1628",
      killServiceOnDestroy: false,
    },
  });

  return true;
};

export const updateDriverBackgroundNotification = async ({
  tripInstanceId,
  apiBase,
  token,
  stopName,
  passengersWaiting,
}) => {
  const waitingCount = Number(passengersWaiting || 0);
  const hasStop = Boolean(String(stopName || "").trim());
  const notificationBody = hasStop
    ? `Next stop: ${String(stopName).trim()} • ${waitingCount} tapped waiting`
    : DEFAULT_NOTIFICATION_BODY;

  return startDriverBackgroundTrackingWithNotification({
    tripInstanceId,
    apiBase,
    token,
    notificationTitle: DEFAULT_NOTIFICATION_TITLE,
    notificationBody,
  });
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

export const getDriverTrackingDebug = async () => {
  try {
    const [started, metaRaw, debugRaw] = await Promise.all([
      Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK),
      AsyncStorage.getItem(DRIVER_LOCATION_META_KEY),
      AsyncStorage.getItem(DRIVER_LOCATION_DEBUG_KEY),
    ]);

    return {
      started,
      meta: metaRaw ? JSON.parse(metaRaw) : null,
      debug: debugRaw ? JSON.parse(debugRaw) : null,
    };
  } catch {
    return {
      started: false,
      meta: null,
      debug: null,
    };
  }
};

export const writeDriverTrackingDebug = async (payload = {}) => {
  try {
    const existingRaw = await AsyncStorage.getItem(DRIVER_LOCATION_DEBUG_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    await AsyncStorage.setItem(
      DRIVER_LOCATION_DEBUG_KEY,
      JSON.stringify({
        ...existing,
        ...payload,
      })
    );
  } catch {
    // best effort only
  }
};

export { DRIVER_LOCATION_TASK };
