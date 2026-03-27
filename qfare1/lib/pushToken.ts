import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let cachedToken: string | null = null;

export const getPassengerPushToken = async (): Promise<string | null> => {
  // Push notifications are not supported in Expo Go (SDK 53+).
  // Returns null gracefully — booking still works, just no bus-approach alerts.
  if (cachedToken) return cachedToken;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    const { status } = existing === 'granted'
      ? { status: existing }
      : await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('bus-alerts', {
        name: 'Bus Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    cachedToken = token;
    return token;
  } catch {
    // Silently fails in Expo Go — works correctly in a development/production build
    return null;
  }
};
