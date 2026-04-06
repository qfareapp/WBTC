import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const USER_ROLE_KEY = "wbtc_user_role";
const PUSH_TOKEN_KEY = "wbtc_expo_push_token";
const OFFER_CHANNEL_ID = "trip-offers";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReadyPromise = null;

const isExpoGo = Constants.executionEnvironment === "storeClient";

const getProjectId = () =>
  Constants.easConfig?.projectId ||
  Constants.expoConfig?.extra?.eas?.projectId ||
  Constants.manifest2?.extra?.eas?.projectId ||
  null;

const ensureAndroidOfferChannel = async () => {
  if (Platform.OS !== "android") return;
  if (!channelReadyPromise) {
    channelReadyPromise = Notifications.setNotificationChannelAsync(OFFER_CHANNEL_ID, {
      name: "Trip offers",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 120, 250],
      lightColor: "#00C87A",
      sound: "qfare_bus_jingle.wav",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {});
  }
  await channelReadyPromise;
};

const getPushRegistration = async () => {
  if (Platform.OS === "web") return null;

  await ensureAndroidOfferChannel();

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android" && !isExpoGo) {
    const deviceToken = await Notifications.getDevicePushTokenAsync();
    const nativeToken =
      typeof deviceToken?.data === "string"
        ? deviceToken.data
        : typeof deviceToken?.data?.token === "string"
        ? deviceToken.data.token
        : null;

    if (nativeToken) {
      return {
        token: nativeToken,
        provider: "fcm",
      };
    }
  }

  const projectId = getProjectId();
  const result = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  if (!result?.data) return null;

  return {
    token: result.data,
    provider: "expo",
  };
};

const getStoredDriverAuth = async (overrides = {}) => {
  const [apiBase, authToken, role] = await Promise.all([
    overrides.apiBase ? Promise.resolve(overrides.apiBase) : AsyncStorage.getItem(API_BASE_KEY),
    overrides.authToken ? Promise.resolve(overrides.authToken) : AsyncStorage.getItem(TOKEN_KEY),
    overrides.role ? Promise.resolve(overrides.role) : AsyncStorage.getItem(USER_ROLE_KEY),
  ]);

  return { apiBase, authToken, role };
};

export const syncDriverPushTokenRegistration = async (overrides = {}) => {
  try {
    const { apiBase, authToken, role } = await getStoredDriverAuth(overrides);
    if (!apiBase || !authToken || role !== "DRIVER") return null;

    const registration = await getPushRegistration();
    if (!registration?.token) return null;

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, registration.token);

    await fetch(`${apiBase}/api/driver-trips/push-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token: registration.token,
        platform: Platform.OS,
        provider: registration.provider,
      }),
    });

    return registration.token;
  } catch {
    return null;
  }
};

export const unregisterStoredDriverPushToken = async (overrides = {}) => {
  try {
    const [storedToken, auth] = await Promise.all([
      overrides.pushToken ? Promise.resolve(overrides.pushToken) : AsyncStorage.getItem(PUSH_TOKEN_KEY),
      getStoredDriverAuth(overrides),
    ]);

    if (!storedToken || !auth.apiBase || !auth.authToken) return;

    await fetch(`${auth.apiBase}/api/driver-trips/push-token`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.authToken}`,
      },
      body: JSON.stringify({ token: storedToken }),
    }).catch(() => {});
  } finally {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  }
};

export const getOfferNotificationChannelId = () => OFFER_CHANNEL_ID;
