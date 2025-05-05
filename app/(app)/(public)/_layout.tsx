import { useAuth } from "@/providers/AuthProvider";
import { Stack, Redirect } from "expo-router";
import { Platform } from "react-native";
import React from "react"; // Import React

const PublicLayout = () => {
  const { authState } = useAuth();
  // Log authentication status on each render of this layout
  console.log("PublicLayout Render - Authenticated:", authState?.authenticated);

  // If the user state indicates authentication, redirect away from public routes
  if (authState.authenticated) {
    console.log("PublicLayout: Redirecting to authenticated tabs...");
    // Adjust href if your main authenticated entry point is different
    return <Redirect href="/(app)/(authenticated)/(tabs)" />; // Adjusted redirect target
  }

  // If not authenticated, render the public screens (login, register)
  console.log("PublicLayout: Rendering public stack (Login/Register)");
  return (
    <Stack screenOptions={{}}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen
        name="register"
        options={{
          title: "Create Account",
          // Header visibility might depend on platform or design preference
          headerShown: Platform.OS !== "web",
          headerBackVisible: false, // Hide back button if header is shown
        }}
      />
    </Stack>
  );
};

export default PublicLayout;
