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

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(() => {
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
