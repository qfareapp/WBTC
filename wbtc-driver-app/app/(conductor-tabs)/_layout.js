import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ConductorLanguageProvider } from "../../contexts/conductor-language";

export default function ConductorTabsLayout() {
  return (
    <ConductorLanguageProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#60A5FA",
          tabBarInactiveTintColor: "rgba(226,232,240,0.62)",
          tabBarStyle: {
            backgroundColor: "#0F172A",
            borderTopColor: "#1E293B",
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
          },
        }}
      >
        <Tabs.Screen
          name="active"
          options={{
            title: "Conductor",
            tabBarIcon: ({ color, size }) => <Ionicons name="ticket-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="tickets"
          options={{
            title: "Tickets",
            tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </ConductorLanguageProvider>
  );
}
