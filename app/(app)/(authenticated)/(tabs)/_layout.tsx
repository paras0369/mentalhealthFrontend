// app/(app)/(authenticated)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import BlurTabBarBackground from "@/components/TabBarBackground.ios";
import { HapticTab } from "@/components/HapticTab";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={
        process.env.EXPO_OS === "ios"
          ? {
              tabBarActiveTintColor: "#0d6c9a",
              tabBarInactiveTintColor: "#8E8E93",
              headerShown: true,
              tabBarButton: HapticTab,
              tabBarBackground: BlurTabBarBackground,
              tabBarStyle: {
                position: "absolute",
              },
            }
          : {
              tabBarActiveTintColor: "#0d6c9a",
              tabBarInactiveTintColor: "#8E8E93",
              headerShown: true,
            }
      }
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: "Home",
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: "Profile",
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
