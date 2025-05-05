// app/_layout.tsx

import React from "react";
import { Slot } from "expo-router";
import "react-native-reanimated";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import {
  ActivityIndicator,
  View,
  useColorScheme,
  StyleSheet,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import "@/global.css";

// Import Providers
import { AuthProvider, useAuth } from "@/providers/AuthProvider"; // useAuth needed in InnerLayout
import { AppointmentProvider } from "@/providers/AppointmentProvider";
import VideoProvider from "@/providers/VideoProvider";
import { OverlayProvider as StreamChatOverlayProvider } from "stream-chat-expo";

// Import the Ringing Call Overlay Component
import { RingingCallsOverlay } from "@/components/RingingCallsOverlay";

/**
 * InitialLayout: Checks initialization state. Renders Slot for main content.
 * This component still needs to be INSIDE AuthProvider because it calls useAuth.
 */
const InitialLayout = () => {
  const { authState, initialized } = useAuth(); // This call is now valid because InitialLayout is rendered inside AuthProvider
  console.log(
    "InitialLayout Render - Initialized:",
    initialized,
    "Authenticated:",
    authState?.authenticated
  );

  if (!initialized) {
    console.log("InitialLayout: Showing Loader (Not Initialized)");
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }
  console.log("InitialLayout: Rendering Slot");
  return <Slot />;
};

/**
 * InnerLayout: This component is rendered INSIDE AuthProvider.
 * It can safely call useAuth() and conditionally render components
 * based on the authentication state.
 */
const InnerLayout = () => {
  const { authState, initialized } = useAuth(); // Call useAuth here
  const colorScheme = useColorScheme(); // Can get colorScheme here if needed, or pass down

  console.log(
    "InnerLayout Render - Initialized:",
    initialized,
    "Authenticated:",
    authState.authenticated
  );

  return (
    <>
      {/* Set status bar style */}
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      {/* InitialLayout handles the !initialized state and renders the main navigation slot */}
      <InitialLayout />

      {/* --- Conditionally Render RingingCallsOverlay --- */}
      {/* Render only when Auth is initialized AND user is authenticated */}
      {initialized && authState.authenticated && <RingingCallsOverlay />}
    </>
  );
};

/**
 * RootLayout: Sets up ALL providers. Renders InnerLayout inside the providers.
 * It does NOT call useAuth() itself.
 */
const RootLayout = () => {
  const colorScheme = useColorScheme(); // Get colorScheme here for ThemeProvider
  console.log(`RootLayout Render - Setting up providers`);

  return (
    <GestureHandlerRootView style={styles.rootView}>
      <StreamChatOverlayProvider>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          {/* AuthProvider Wraps everything that needs auth context */}
          <AuthProvider>
            <AppointmentProvider>
              {/* VideoProvider wraps InnerLayout because RingingCallsOverlay needs its context */}
              <VideoProvider>
                {/* Render the InnerLayout which CAN use the contexts */}
                <InnerLayout />
              </VideoProvider>
            </AppointmentProvider>
          </AuthProvider>
        </ThemeProvider>
      </StreamChatOverlayProvider>
    </GestureHandlerRootView>
  );
};

// Styles
const styles = StyleSheet.create({
  rootView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF", // Or use theme
  },
});

export default RootLayout;
