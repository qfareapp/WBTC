import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppLanguage } from "../../contexts/shared-language";

export default function OwnerTabsLayout() {
  const { t } = useAppLanguage();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#00C87A",
        tabBarInactiveTintColor: "rgba(255,255,255,0.5)",
        tabBarStyle: {
          backgroundColor: "#0D2240",
          borderTopColor: "rgba(255,255,255,0.1)",
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
          title: t("ownerTabs", "fleet"),
          tabBarIcon: ({ color, size }) => <Ionicons name="bus-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: t("ownerTabs", "routes"),
          tabBarIcon: ({ color, size }) => <Ionicons name="analytics-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="crew"
        options={{
          title: t("ownerTabs", "crew"),
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("ownerTabs", "profile"),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
