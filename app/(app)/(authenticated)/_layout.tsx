import { useAuth } from "@/providers/AuthProvider";
import { Stack, Redirect, useRouter } from "expo-router";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ChatProvider from "@/providers/ChatProvider";
import VideoProvider from "@/providers/VideoProvider";
// AppointmentProvider is now higher up in app/_layout.tsx
// import { AppointmentProvider } from '@/providers/AppointmentProvider';
import React from "react"; // Import React

const AuthenticatedLayout = () => {
  const { authState } = useAuth();
  const router = useRouter();
  // Log authentication status on each render
  console.log(
    "AuthenticatedLayout Render - Authenticated:",
    authState?.authenticated
  );

  // If somehow the user is not authenticated here, redirect to login
  // This acts as a gatekeeper for all routes within this layout
  if (!authState.authenticated) {
    console.log(
      "AuthenticatedLayout: Not authenticated, redirecting to login..."
    );
    return <Redirect href="/login" />;
  }

  // If authenticated, provide Chat & Video contexts and render the authenticated screens
  console.log(
    "AuthenticatedLayout: Rendering authenticated stack with Chat/Video providers"
  );
  return (
    // These providers need the authenticated user's streamToken/streamId from AuthProvider
    <ChatProvider>
      <VideoProvider>
        {/* <AppointmentProvider>  <- Removed from here, now in app/_layout */}
        <Stack>
          {/* Main Tabs */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* Modals */}
          <Stack.Screen
            name="(modal)/create-chat"
            options={{
              presentation: "modal",
              title: "Start a Chat",
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => router.back()}
                  style={{ marginLeft: 10 }}
                >
                  <Ionicons name="close-outline" size={28} color="black" />
                </TouchableOpacity>
              ),
            }}
          />

          {/* Chat Screens */}
          <Stack.Screen
            name="chat/[id]/index"
            options={{ headerBackTitle: "Chats", title: "" }} // Title might be set dynamically
          />
          <Stack.Screen
            name="chat/[id]/manage"
            options={{ title: "Manage Chat Members" }}
          />
          <Stack.Screen
            name="chat/[id]/thread"
            options={{ title: "Thread" }} // Title could be more dynamic
          />

          {/* Consultation Screens */}
          <Stack.Screen
            name="consultation/schedule"
            options={{
              title: "Schedule Consultation",
              headerBackTitle: "Back",
              presentation: "modal", // Example: open as modal
            }}
          />
          <Stack.Screen
            name="consultation/[id]"
            options={{
              title: "Consultation Call", // Can be dynamic
              headerBackTitle: "Back",
            }}
          />
        </Stack>
        {/* </AppointmentProvider> <- Removed from here */}
      </VideoProvider>
    </ChatProvider>
  );
};

export default AuthenticatedLayout;
