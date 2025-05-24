// components/CallNotificationListener.tsx
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  StatusBar,
  SafeAreaView,
  Vibration,
  Alert,
} from "react-native";
import {
  useStreamVideoClient,
  StreamCall,
  Call,
} from "@stream-io/video-react-native-sdk";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, API_URL } from "@/providers/AuthProvider";

const { width, height } = Dimensions.get("window");

interface IncomingCallNotification {
  id: string;
  callId: string;
  callMode: "audio" | "video";
  callerName: string;
  callRate: number;
  createdAt: string;
}

const CallNotificationListener = () => {
  const client = useStreamVideoClient();
  const router = useRouter();
  const { authState, isTherapist } = useAuth();
  const [incomingNotification, setIncomingNotification] =
    useState<IncomingCallNotification | null>(null);
  const [currentCall, setCurrentCall] = useState<Call | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckedRef = useRef<string | null>(null);

  // Only run for therapists
  useEffect(() => {
    if (!isTherapist || !authState.jwt) {
      return;
    }

    console.log(
      "[CallNotificationListener] Starting notification polling for therapist"
    );

    const pollForNotifications = async () => {
      try {
        const response = await fetch(`${API_URL}/calls/pending-notifications`, {
          headers: {
            Authorization: `Bearer ${authState.jwt}`,
          },
        });

        if (!response.ok) {
          console.error(
            "[CallNotificationListener] Failed to fetch notifications"
          );
          return;
        }

        const notifications: IncomingCallNotification[] = await response.json();

        if (notifications.length > 0) {
          const latestNotification = notifications[0];

          // Only show if this is a new notification
          if (lastCheckedRef.current !== latestNotification.id) {
            console.log(
              "[CallNotificationListener] New incoming call notification:",
              latestNotification
            );
            lastCheckedRef.current = latestNotification.id;
            setIncomingNotification(latestNotification);

            // Start vibration
            Vibration.vibrate([0, 1000, 500, 1000], true);

            // Try to get the call from Stream
            if (client) {
              try {
                const call = client.call("default", latestNotification.callId);
                await call.get(); // This will throw if call doesn't exist
                setCurrentCall(call);
              } catch (error) {
                console.log(
                  "[CallNotificationListener] Call not found in Stream yet, will retry"
                );
              }
            }
          }
        }
      } catch (error) {
        console.error(
          "[CallNotificationListener] Error polling notifications:",
          error
        );
      }
    };

    // Poll every 2 seconds
    pollingRef.current = setInterval(pollForNotifications, 2000);

    // Initial check
    pollForNotifications();

    return () => {
      console.log("[CallNotificationListener] Cleaning up polling");
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      Vibration.cancel();
    };
  }, [isTherapist, authState.jwt, client]);

  const acceptCall = async () => {
    if (!incomingNotification) return;

    console.log(
      "[CallNotificationListener] Accepting call:",
      incomingNotification.callId
    );

    try {
      // Stop vibration
      Vibration.cancel();

      let call = currentCall;

      // If we don't have the call yet, try to get it
      if (!call && client) {
        call = client.call("default", incomingNotification.callId);
        try {
          await call.get();
        } catch (error) {
          Alert.alert("Error", "Call is no longer available.");
          await clearNotification();
          return;
        }
      }

      if (!call) {
        Alert.alert("Error", "Unable to connect to the call.");
        await clearNotification();
        return;
      }

      // Configure call settings based on intended mode
      if (incomingNotification.callMode === "audio") {
        await call.camera.disable();
        await call.microphone.enable();
      } else {
        await call.camera.enable();
        await call.microphone.enable();
      }

      // Join the call (no need to accept since there's no ringing)
      await call.join();

      // Navigate to consultation screen
      router.push({
        pathname: "/(app)/(authenticated)/consultation/[id]",
        params: {
          id: incomingNotification.callId,
          initialCallMode: incomingNotification.callMode,
          therapistName: "You", // Since therapist is accepting
          callRate: incomingNotification.callRate.toString(),
        },
      });

      // Clear the notification from backend
      await clearNotification();
    } catch (error) {
      console.error("[CallNotificationListener] Error accepting call:", error);
      Alert.alert("Error", "Failed to join the call.");
      await clearNotification();
    }
  };

  const rejectCall = async () => {
    if (!incomingNotification) return;

    console.log(
      "[CallNotificationListener] Rejecting call:",
      incomingNotification.callId
    );

    try {
      // Stop vibration
      Vibration.cancel();

      // If we have the call, leave it
      if (currentCall) {
        try {
          await currentCall.leave();
        } catch (error) {
          console.log("[CallNotificationListener] Error leaving call:", error);
        }
      }

      // Clear the notification
      await clearNotification();
    } catch (error) {
      console.error("[CallNotificationListener] Error rejecting call:", error);
      await clearNotification();
    }
  };

  const clearNotification = async () => {
    try {
      if (incomingNotification && authState.jwt) {
        await fetch(
          `${API_URL}/calls/clear-notification/${incomingNotification.id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${authState.jwt}`,
            },
          }
        );
      }
    } catch (error) {
      console.error(
        "[CallNotificationListener] Error clearing notification:",
        error
      );
    }

    setIncomingNotification(null);
    setCurrentCall(null);
    Vibration.cancel();
  };

  if (!incomingNotification) {
    return null;
  }

  const isVideoCall = incomingNotification.callMode === "video";

  return (
    <Modal visible={true} animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1A202C" />

        {/* Background */}
        <View style={styles.background}>
          <View style={[styles.ripple, styles.ripple1]} />
          <View style={[styles.ripple, styles.ripple2]} />
          <View style={[styles.ripple, styles.ripple3]} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.callTypeLabel}>
            Incoming {isVideoCall ? "Video" : "Audio"} Call
          </Text>
        </View>

        {/* Main content */}
        <View style={styles.content}>
          {/* Caller info */}
          <View style={styles.callerSection}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Ionicons
                  name="person"
                  size={80}
                  color="rgba(255,255,255,0.9)"
                />
              </View>
              <View style={styles.pulsingRing} />
            </View>

            <Text style={styles.callerName}>
              {incomingNotification.callerName || "Unknown Caller"}
            </Text>
            <Text style={styles.callerRole}>Client</Text>

            <Text style={styles.callRate}>
              {incomingNotification.callRate} coins/min
            </Text>
          </View>

          {/* Call actions */}
          <View style={styles.actionsContainer}>
            {/* Reject button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={rejectCall}
              activeOpacity={0.8}
            >
              <Ionicons name="call" size={32} color="white" />
            </TouchableOpacity>

            {/* Accept button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={acceptCall}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isVideoCall ? "videocam" : "call"}
                size={32}
                color="white"
              />
            </TouchableOpacity>
          </View>

          {/* Action labels */}
          <View style={styles.actionLabels}>
            <Text style={styles.actionLabel}>Decline</Text>
            <Text style={styles.actionLabel}>Accept</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A202C",
  },
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ripple: {
    position: "absolute",
    borderRadius: 400,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  ripple1: {
    width: 300,
    height: 300,
    top: "40%",
    left: "50%",
    marginLeft: -150,
    marginTop: -150,
  },
  ripple2: {
    width: 400,
    height: 400,
    top: "40%",
    left: "50%",
    marginLeft: -200,
    marginTop: -200,
  },
  ripple3: {
    width: 500,
    height: 500,
    top: "40%",
    left: "50%",
    marginLeft: -250,
    marginTop: -250,
  },
  header: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 40,
  },
  callTypeLabel: {
    fontSize: 18,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  callerSection: {
    alignItems: "center",
    marginBottom: 80,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 32,
  },
  avatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  pulsingRing: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: "#3B82F6",
    top: -10,
    left: -10,
  },
  callerName: {
    fontSize: 28,
    fontWeight: "700",
    color: "white",
    textAlign: "center",
    marginBottom: 8,
  },
  callerRole: {
    fontSize: 18,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 12,
  },
  callRate: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
  },
  actionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: 200,
    marginBottom: 16,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  rejectButton: {
    backgroundColor: "#EF4444",
    transform: [{ rotate: "135deg" }],
  },
  acceptButton: {
    backgroundColor: "#10B981",
  },
  actionLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 200,
  },
  actionLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    width: 72,
  },
});

export default CallNotificationListener;
