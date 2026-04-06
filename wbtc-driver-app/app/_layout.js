import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppLanguageProvider } from "../contexts/shared-language";
import PushNotificationBridge from "../components/PushNotificationBridge";
import "../lib/driverBackgroundLocation";

export const unstable_settings = {
  initialRouteName: "login",
};

export default function RootLayout() {
  return (
    <AppLanguageProvider>
      <>
        <StatusBar style="light" backgroundColor="#0A1628" />
        <PushNotificationBridge />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(conductor-tabs)" />
          <Stack.Screen name="(owner-tabs)" />
          <Stack.Screen name="trip" />
          <Stack.Screen name="trip-summary" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </>
    </AppLanguageProvider>
  );
}
