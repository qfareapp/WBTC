import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import QRScannerScreen from '../screens/QRScannerScreen';
import TicketScreen from '../screens/TicketScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoginScreen from '../screens/LoginScreen';
import OtpScreen from '../screens/OtpScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import { useAuth } from '../lib/auth';
import LoadingScreen from '../components/LoadingScreen';
import { palette } from '../lib/theme';

export type RootStackParamList = {
  Tabs: undefined;
  Ticket: {
    source: string;
    destination: string;
    fare: number;
    passengerCount: number;
    busNumber: string;
    routeCode: string;
    routeName: string;
    bookingId: string;
    bookedAt: string;
    tripInstanceId: string | null;
  };
  Login: undefined;
  Otp: {
    email: string;
  };
  CompleteProfile: undefined;
};

export type BottomTabParamList = {
  Home: undefined;
  Scan: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<BottomTabParamList>();

type TabIconProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconActive: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  focused: boolean;
  isScan?: boolean;
};

const TabIcon = ({ icon, iconActive, color, focused, isScan }: TabIconProps) => {
  if (isScan) {
    return (
      <View style={[styles.scanTabIcon, focused && styles.scanTabIconActive]}>
        <Ionicons name={focused ? iconActive : icon} size={22} color={focused ? '#fff' : palette.textFaint} />
      </View>
    );
  }
  return (
    <View style={styles.tabIconWrap}>
      <Ionicons name={focused ? iconActive : icon} size={22} color={color} />
      {focused && <View style={styles.tabDot} />}
    </View>
  );
};

const TabsNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: palette.surface,
        borderTopColor: palette.border,
        borderTopWidth: 1,
        marginHorizontal: 14,
        marginBottom: 10,
        borderRadius: 26,
        height: 88,
        paddingTop: 6,
        paddingBottom: 18,
        position: 'absolute',
        shadowColor: '#9cb6d0',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 12
      },
      tabBarActiveTintColor: palette.accent,
      tabBarInactiveTintColor: palette.textFaint,
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3
      },
      tabBarItemStyle: {
        paddingTop: 2
      }
    }}
  >
    <Tab.Screen
      name="Home"
      component={HomeScreen}
      options={{
        tabBarLabel: 'Home',
        tabBarIcon: ({ color, focused }) => (
          <TabIcon icon="home-outline" iconActive="home" color={color} focused={focused} />
        )
      }}
    />
    <Tab.Screen
      name="Scan"
      component={QRScannerScreen}
      options={{
        tabBarLabel: 'Scan',
        tabBarIcon: ({ color, focused }) => (
          <TabIcon icon="scan-outline" iconActive="scan" color={color} focused={focused} isScan />
        )
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarLabel: 'Profile',
        tabBarIcon: ({ color, focused }) => (
          <TabIcon icon="person-outline" iconActive="person" color={color} focused={focused} />
        )
      }}
    />
  </Tab.Navigator>
);

const AppNavigator = () => {
  const { token, user, loading } = useAuth();
  const [minimumBootElapsed, setMinimumBootElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumBootElapsed(true);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  if (loading || !minimumBootElapsed) {
    return (
      <View style={styles.splash}>
        <LoadingScreen />
      </View>
    );
  }

  // Not logged in → show Login
  if (!token || !user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Otp" component={OtpScreen} />
      </Stack.Navigator>
    );
  }

  // Logged in but profile not complete → show CompleteProfile
  if (!user.profileComplete) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
      </Stack.Navigator>
    );
  }

  // Fully authenticated → show main app
  return (
    <Stack.Navigator
      initialRouteName="Tabs"
      screenOptions={{
        headerStyle: { backgroundColor: palette.surfaceMuted },
        headerTintColor: palette.text,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: palette.bg }
      }}
    >
      <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Ticket" component={TicketScreen} options={{ title: 'Digital Ticket' }} />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    gap: 4
  },
  tabDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.accent
  },
  scanTabIcon: {
    width: 52,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.cta,
    borderWidth: 1,
    borderColor: palette.ctaSoft
  },
  scanTabIconActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent
  }
});

export default AppNavigator;
