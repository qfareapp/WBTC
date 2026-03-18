import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppLanguage } from "../../contexts/shared-language";

export default function TabsLayout() {
  const { t } = useAppLanguage();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#00C87A",
        tabBarInactiveTintColor: "rgba(226,232,240,0.55)",
        tabBarStyle: {
          backgroundColor: "#081634",
          borderTopColor: "rgba(255,255,255,0.08)",
          height: 70,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="active"
        options={{
          title: t("driverTabs", "active"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="completed"
        options={{
          title: t("driverTabs", "completed"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("driverTabs", "profile"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
