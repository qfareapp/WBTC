import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { syncDriverPushTokenRegistration } from "../utils/pushNotifications";

export default function PushNotificationBridge() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return undefined;

    syncDriverPushTokenRegistration().catch(() => {});

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      const tripInstanceId =
        typeof data.tripInstanceId === "string" ? data.tripInstanceId : null;

      if (data.action === "open_end_trip" && tripInstanceId) {
        router.replace({
          pathname: "/trip",
          params: { tripInstanceId, openEndTrip: "1" },
        });
        return;
      }

      router.replace("/(tabs)/active");
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncDriverPushTokenRegistration().catch(() => {});
      }
    });

    return () => {
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [router]);

  return null;
}
