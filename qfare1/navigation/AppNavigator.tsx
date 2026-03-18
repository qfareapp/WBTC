import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import QRScannerScreen from '../screens/QRScannerScreen';
import TicketScreen from '../screens/TicketScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type RootStackParamList = {
  Tabs: undefined;
  Ticket: {
    source: string;
    destination: string;
    fare: number;
    busNumber: string;
    routeCode: string;
    routeName: string;
    bookingId: string;
    bookedAt: string;
  };
};

export type BottomTabParamList = {
  Home: undefined;
  Scan: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<BottomTabParamList>();

const TabsNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: '#0B1828', borderTopColor: '#1F4C78' },
      tabBarActiveTintColor: '#4DD4AC',
      tabBarInactiveTintColor: '#A6BDD8'
    }}
  >
    <Tab.Screen
      name="Home"
      component={HomeScreen}
      options={{
        tabBarLabel: 'Home',
        tabBarIcon: ({ color }) => <Text style={{ color }}>H</Text>
      }}
    />
    <Tab.Screen
      name="Scan"
      component={QRScannerScreen}
      options={{
        tabBarLabel: 'Scan',
        tabBarIcon: ({ color }) => <Text style={{ color }}>S</Text>
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarLabel: 'Profile',
        tabBarIcon: ({ color }) => <Text style={{ color }}>P</Text>
      }}
    />
  </Tab.Navigator>
);

const AppNavigator = () => (
  <Stack.Navigator initialRouteName="Tabs">
    <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
    <Stack.Screen name="Ticket" component={TicketScreen} />
  </Stack.Navigator>
);

export default AppNavigator;
