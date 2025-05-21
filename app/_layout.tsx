// app/_layout.tsx
import React, { useEffect, useState } from "react";
import { Slot, useRouter } from "expo-router";
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
  SafeAreaView,
  Text,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import "@/global.css";

// Import Providers & SDK Components
import { AuthProvider, useAuth } from "@/providers/AuthProvider";

import {
  StreamVideo,
  StreamVideoClient,
  User as StreamSDKUser,
  StreamCall,
  useCalls,
  RingingCallContent,
} from "@stream-io/video-react-native-sdk";
// REMOVED: import { OverlayProvider as StreamChatOverlayProvider } from "stream-chat-expo"; // <-- REMOVE

const apiKey = process.env.EXPO_PUBLIC_STREAM_ACCESS_KEY as string;

// --- Global Ringing UI Component (Remains the same) ---
const RingingCalls = () => {
  const calls = useCalls().filter((c) => c.ringing);
  const ringingCall = calls[0];
  const router = useRouter();

  if (!ringingCall) {
    return null;
  }

  console.log(
    `[RingingCalls] Rendering for call ID: ${ringingCall.id}, State: ${ringingCall.state.callingState}, isCreatedByMe: ${ringingCall.isCreatedByMe}`
  );
  return (
    <StreamCall call={ringingCall}>
      <SafeAreaView style={StyleSheet.absoluteFill}>
        <View style={styles.ringingContainer}>
          <Text style={styles.ringingText}>Incoming Call</Text>
          <RingingCallContent />
        </View>
      </SafeAreaView>
    </StreamCall>
  );
};
// --- End Global Ringing UI Component ---

const InnerApp = () => {
  const { authState, initialized } = useAuth();
  const colorScheme = useColorScheme();
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(
    null
  );

  // useEffect for video client initialization (Remains the same)
  useEffect(() => {
    let client: StreamVideoClient;
    let unmounted = false;

    if (
      authState.authenticated &&
      authState.streamId &&
      authState.streamToken &&
      apiKey
    ) {
      console.log(
        "[InnerApp EFFECT] Auth ready, creating/getting video client for:",
        authState.streamId
      );
      const user: StreamSDKUser = {
        id: authState.streamId,
        name: authState.email || authState.streamId,
      };
      client = StreamVideoClient.getOrCreateInstance({
        apiKey,
        user,
        token: authState.streamToken,
      });
      if (!unmounted) {
        setVideoClient(client);
      }
    } else if (videoClient) {
      console.log("[InnerApp EFFECT] Logging out, disconnecting video client.");
      videoClient
        .disconnectUser()
        .catch((e) => console.error("Error disconnecting user:", e));
      if (!unmounted) {
        setVideoClient(null);
      }
    }

    return () => {
      unmounted = true;
    };
  }, [authState.authenticated, authState.streamId, authState.streamToken]);

  // Loading states (Remain the same)
  if (!initialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }
  if (authState.authenticated && (!videoClient || !apiKey)) {
    if (!apiKey) console.error("Stream API Key is missing!");
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.text}>
          {!apiKey ? "Missing API Key" : "Initializing services..."}
        </Text>
      </View>
    );
  }

  // --- Render Logic (ChatProvider Removed) ---
  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      {videoClient ? (
        <StreamVideo client={videoClient}>
          <Slot /> {/* Main app content */}
          <RingingCalls /> {/* Global ringing UI on top */}
        </StreamVideo>
      ) : (
        <Slot />
      )}
    </>
  );
};

const RootLayout = () => {
  const colorScheme = useColorScheme();
  console.log(`RootLayout Render - Setting up providers`);

  return (
    <GestureHandlerRootView style={styles.rootView}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <InnerApp />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  rootView: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  text: {
    marginTop: 10,
    fontSize: 16,
  },
  ringingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  ringingText: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
});

export default RootLayout;
