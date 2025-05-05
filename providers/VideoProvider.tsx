import { useAuth } from "@/providers/AuthProvider";
import {
  StreamVideoClient,
  StreamVideo,
  User as StreamUser,
} from "@stream-io/video-react-native-sdk";
import React, { PropsWithChildren, useEffect, useState } from "react";
import { ActivityIndicator, View, Text } from "react-native";

const apiKey = process.env.EXPO_PUBLIC_STREAM_ACCESS_KEY as string;
if (!apiKey) {
  console.error(
    "VideoProvider FATAL ERROR: EXPO_PUBLIC_STREAM_ACCESS_KEY is not defined!"
  );
}

export default function VideoProvider({ children }: PropsWithChildren) {
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(
    null
  );
  const { authState } = useAuth();
  // Removed isConnecting state as client creation/connection is often synchronous enough
  // or handled internally by StreamVideo component. We rely on videoClient being null/not null.
  const [error, setError] = useState<string | null>(null); // Error state

  useEffect(() => {
    console.log(
      "VideoProvider Effect - Authenticated:",
      authState.authenticated
    );

    // Prevent re-initializing if client already exists and user matches
    if (videoClient && videoClient.user?.id === authState.streamId) {
      console.log("VideoProvider: Client already initialized for this user.");
      // Ensure error is cleared if we previously had one
      if (error) setError(null);
      return;
    }

    // --- Client Creation/Update Logic ---
    if (
      apiKey &&
      authState.authenticated &&
      authState.streamId &&
      authState.streamToken
    ) {
      const initVideoClient = () => {
        console.log(
          `VideoProvider: Initializing client for user ${authState.streamId}`
        );
        setError(null); // Reset error

        const user: StreamUser = {
          id: authState.streamId!,
          name: authState.email!,
          // --- ROLE REMOVED ---
          // As with ChatProvider, role shouldn't be set by frontend client.
          // Add other non-sensitive user fields if needed by Video SDK features.
        };

        try {
          // Create a new client instance. Connection might happen implicitly
          // when <StreamVideo> component mounts or explicitly if needed.
          const client = new StreamVideoClient({
            apiKey,
            user,
            token: authState.streamToken!,
          });
          console.log("VideoProvider: Client instance created.");
          // Connect is often implicitly handled by the StreamVideo component
          // that uses this client. If you face connection issues, you might
          // try adding `await client.connect()` here, but it's often not needed.

          setVideoClient(client); // Set the client in state
          setError(null); // Clear any previous error
        } catch (e: any) {
          console.error("VideoProvider: Failed to initialize client:", e);
          setVideoClient(null); // Ensure client is null on error
          const errorMessage =
            e?.message ||
            (e && typeof e === "object" ? JSON.stringify(e) : "Unknown error");
          setError(`Video Service Init Failed: ${errorMessage}`);
        }
      };
      initVideoClient();
    } else if (!authState.authenticated && videoClient) {
      // Handle logout: If user becomes unauthenticated while client exists
      console.log(
        "VideoProvider: User logged out, disconnecting and clearing client..."
      );
      // Disconnect is async, but we primarily care about removing the client instance
      videoClient
        .disconnectUser()
        .catch((err) =>
          console.error("VideoProvider: Error disconnecting:", err)
        );
      setVideoClient(null);
      setError(null); // Clear error on logout
    } else if (!apiKey) {
      console.error("VideoProvider: Cannot initialize, API Key missing.");
      setError("Video services cannot be initialized (Missing API Key).");
    } else {
      console.log(
        "VideoProvider: Skipping initialization (Not authenticated or missing details)."
      );
      // If not authenticated, ensure client is null and no error is shown for this state
      if (!authState.authenticated) {
        setVideoClient(null);
        setError(null);
      }
    }

    // --- Cleanup Function ---
    // Runs on unmount or when dependencies change significantly
    return () => {
      // Check the current state value, not the potentially stale closure value
      setVideoClient((currentClient) => {
        if (currentClient) {
          console.log("VideoProvider: Cleanup effect. Disconnecting user...");
          currentClient.disconnectUser().catch((err) => {
            console.error(
              "VideoProvider: Error disconnecting user during cleanup:",
              err
            );
          });
        }
        return null; // Always clear client on cleanup related to auth changes/unmount
      });
      setError(null); // Clear error on cleanup
    };
    // Depend only on the necessary authState fields to trigger re-init
  }, [
    apiKey,
    authState.authenticated,
    authState.streamId,
    authState.streamToken,
  ]);

  // --- Render Logic ---

  // If authenticated but the client hasn't been set yet (and no error occurred)
  if (apiKey && authState.authenticated && !videoClient && !error) {
    console.log(
      "VideoProvider: Rendering Loader View (Authenticated, client init pending)."
    );
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator />
        <Text className="text-gray-500 mt-2">
          Initializing video services...
        </Text>
      </View>
    );
  }

  // If an error occurred during initialization
  if (error) {
    console.log("VideoProvider: Rendering Error View.");
    return (
      <View className="flex-1 justify-center items-center p-5">
        <Text className="text-red-500 text-center mb-4">{error}</Text>
      </View>
    );
  }

  // If client exists (meaning authenticated and initialized successfully)
  if (videoClient) {
    console.log("VideoProvider: Rendering StreamVideo component.");
    return <StreamVideo client={videoClient}>{children}</StreamVideo>;
  }

  // If not authenticated, videoClient will be null, just render children
  // This allows non-authenticated parts of the app not wrapped by this layout to render
  if (!authState.authenticated) {
    console.log(
      "VideoProvider: Not authenticated, rendering children directly."
    );
    return <>{children}</>;
  }

  // Fallback shouldn't ideally be reached if logic is correct
  console.warn("VideoProvider: Reached fallback render state (Investigate).");
  return (
    <View className="flex-1 justify-center items-center">
      <ActivityIndicator />
    </View>
  );
}
