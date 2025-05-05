import { View, ActivityIndicator, Text } from "react-native";
import { useLocalSearchParams, Stack, Link } from "expo-router";
import {
  MessageList,
  Channel,
  useChatContext,
  MessageInput,
} from "stream-chat-expo";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";

const ChatPage = () => {
  const { id: plainChannelId } = useLocalSearchParams<{ id: string }>();
  const { client } = useChatContext();
  const { isTherapist } = useAuth();
  const router = useRouter();

  const [channel, setChannel] = useState<any>(null);
  const [loadingChannel, setLoadingChannel] = useState(true);

  useEffect(() => {
    if (client && plainChannelId) {
      console.log(
        `Chat Screen: Setting up channel for plain ID: ${plainChannelId}`
      );
      setLoadingChannel(true);
      const channelInstance = client.channel("messaging", plainChannelId);

      channelInstance
        .watch()
        .then(() => {
          console.log(
            `Chat Screen: Successfully watched channel ${channelInstance.cid}`
          );
          setChannel(channelInstance);
          setLoadingChannel(false);
        })
        .catch((err) => {
          console.error(
            `Chat Screen: Error watching channel ${plainChannelId}:`,
            err
          );
          setLoadingChannel(false);
        });
    } else {
      console.warn("Chat Screen: Chat client not ready or channel ID missing.");
      setLoadingChannel(false);
    }
  }, [client, plainChannelId]);

  if (loadingChannel || !client) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
        <Text>Loading Chat...</Text>
      </View>
    );
  }

  if (!channel) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "red" }}>
          Error: Could not load chat channel.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: channel?.data?.name || "Chat",
          headerBackTitle: "Back",
          headerRight: () => (
            <>
              {isTherapist && channel?.data?.member_count === 2 && (
                <Link
                  href={`/chat/${plainChannelId}/manage`}
                  style={{ marginRight: 10 }}
                >
                  <Text style={{ color: "#007AFF" }}>Manage</Text>
                </Link>
              )}
            </>
          ),
        }}
      />

      <Channel channel={channel}>
        <MessageList />
        <MessageInput />
      </Channel>
    </View>
  );
};

export default ChatPage;
