import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppLanguageProvider } from "../contexts/shared-language";
import LoadingScreen from "../components/LoadingScreen";
import PushNotificationBridge from "../components/PushNotificationBridge";
import "../lib/driverBackgroundLocation";

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  initialRouteName: "login",
};

export default function RootLayout() {
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setShowLoadingScreen(false);
      SplashScreen.hideAsync().catch(() => {});
    }, 1600);

    return () => clearTimeout(timeoutId);
  }, []);

  if (showLoadingScreen) {
    return (
      <AppLanguageProvider>
        <>
          <StatusBar style="light" backgroundColor="#0f1c2e" />
          <LoadingScreen />
        </>
      </AppLanguageProvider>
    );
  }

  return (
    <AppLanguageProvider>
      <>
        <StatusBar style="light" backgroundColor="#0f1c2e" />
        <PushNotificationBridge />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="change-password" />
          <Stack.Screen name="privacy-policy" />
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
