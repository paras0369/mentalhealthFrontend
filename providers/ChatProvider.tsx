import React, { PropsWithChildren, useEffect, useState } from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { StreamChat } from "stream-chat";
import { Chat, OverlayProvider } from "stream-chat-expo";
import { useAuth } from "./AuthProvider";

const apiKey = process.env.EXPO_PUBLIC_STREAM_ACCESS_KEY as string;
if (!apiKey) {
  console.error(
    "ChatProvider FATAL ERROR: EXPO_PUBLIC_STREAM_ACCESS_KEY is not defined!"
  );
  // Optionally, you could render an error state here or throw an error
  // that gets caught by an error boundary.
}
// Initialize client only once - check if apiKey exists before calling getInstance
const client = apiKey ? StreamChat.getInstance(apiKey) : null;

// Define your chat theme or use an empty object if no custom theme
const chatTheme = {
  channelPreview: {
    container: {
      backgroundColor: "transparent",
    },
  },
  // Add other theme customizations if needed
};

export default function ChatProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const { authState } = useAuth();
  const [error, setError] = useState<string | null>(null); // Add error state

  useEffect(() => {
    console.log(
      "ChatProvider Effect - Authenticated:",
      authState.authenticated
    );

    // Ensure client was initialized (apiKey was present)
    if (!client) {
      setError("Chat client could not be initialized (Missing API Key).");
      console.error(
        "ChatProvider: StreamChat.getInstance(apiKey) failed, client is null."
      );
      setIsReady(false); // Not ready if client is null
      return;
    }

    // --- Connection Logic ---
    if (
      authState.authenticated &&
      authState.streamId &&
      authState.streamToken &&
      !client.userID // Check if client already has a user ID connected
    ) {
      const connectUser = async () => {
        console.log(
          `ChatProvider: Attempting to connect user ${authState.streamId}`
        );
        setError(null); // Reset error
        try {
          await client.connectUser(
            {
              id: authState.streamId!,
              // name: authState.email!, // Set name
              // --- ROLE REMOVED ---
              // The backend sets the role during user creation (upsertUser).
              // Frontend connection doesn't need (and shouldn't have) permission to set it.
            },
            authState.streamToken!
          );
          console.log("ChatProvider: User connected successfully.");
          setIsReady(true);
        } catch (e: any) {
          console.error("ChatProvider: Failed to connect user:", e);
          // Provide a more user-friendly error or use e.message
          const errorMessage =
            e?.message ||
            (e && typeof e === "object" ? JSON.stringify(e) : "Unknown Error");
          setError(`Chat Connection Failed: ${errorMessage}`);
          setIsReady(false); // Ensure not ready on error
        }
      };
      connectUser();

      // --- Cleanup Function ---
      // This cleanup runs when dependencies change OR component unmounts
      return () => {
        console.log(
          "ChatProvider: Cleanup effect. Client UserID:",
          client.userID
        );
        // Disconnect only if a user is currently connected with this client instance
        if (client.userID) {
          console.log("ChatProvider: Disconnecting user...");
          // Disconnect is async but we often don't need to wait for it in cleanup
          client
            .disconnectUser()
            .then(() => {
              console.log("ChatProvider: User disconnected.");
            })
            .catch((err) => {
              console.error("ChatProvider: Error disconnecting user:", err);
            });
          // Resetting state here might be needed if you want the loader
          // to show immediately on logout before AuthProvider fully updates.
          // However, AuthProvider triggering a re-render should handle this.
          // setIsReady(false);
          // setError(null);
        }
      };
    } else if (!authState.authenticated && client.userID) {
      // Handle logout: If user becomes unauthenticated while client is connected
      console.log("ChatProvider: User logged out, disconnecting client...");
      client.disconnectUser();
      setIsReady(false);
      setError(null);
    } else if (
      client.userID &&
      authState.streamId === client.userID &&
      !isReady
    ) {
      // Handle case where client is connected (e.g. from previous session) but state isn't ready
      console.log(
        "ChatProvider: Client already connected for user, setting isReady=true."
      );
      setIsReady(true);
      setError(null); // Clear any previous error
    } else {
      console.log(
        "ChatProvider: Skipping connection (Not authenticated, missing details, or already connected/ready)."
      );
    }
    // Dependencies for the effect
  }, [authState.authenticated, authState.streamId, authState.streamToken]);

  // --- Render Logic ---
  // Show loader/error only if authentication is attempted but connection isn't ready
  if (authState.authenticated && !isReady) {
    console.log(
      "ChatProvider: Rendering Loader/Error View (Authenticated but not ready)."
    );
    return (
      <View className="flex-1 justify-center items-center p-5">
        {error ? (
          // Display error message if connection failed
          <Text className="text-red-500 text-center mb-4">{error}</Text>
        ) : (
          // Show loader while connecting
          <ActivityIndicator className="mb-2" />
        )}
        <Text className="text-gray-500">Connecting to chat...</Text>
      </View>
    );
  }

  // If not authenticated, or if ready, render children (Chat component will handle client internally)
  // Ensure client is valid before rendering Chat
  if (!client) {
    console.log("ChatProvider: Rendering error view (Client not initialized).");
    return (
      <View className="flex-1 justify-center items-center p-5">
        <Text className="text-red-500 text-center mb-4">
          Chat services could not be initialized. Missing API Key.
        </Text>
      </View>
    );
  }

  console.log("ChatProvider: Rendering Chat component wrapper.");
  // OverlayProvider and Chat need the initialized client
  return (
    <OverlayProvider value={{ style: chatTheme }}>
      <Chat client={client}>{children}</Chat>
    </OverlayProvider>
  );
}
