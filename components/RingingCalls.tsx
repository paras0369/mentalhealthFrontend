// components/RingingCalls.tsx
import React, { useEffect, useState } from "react";
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
} from "react-native";
import {
  useStreamVideoClient,
  CallingState,
  useCallStateHooks,
  StreamCall,
  Call,
} from "@stream-io/video-react-native-sdk";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";

const { width, height } = Dimensions.get("window");

interface IncomingCallData {
  caller_id: string;
  caller_name: string;
  therapist_name?: string;
  intended_call_mode: "audio" | "video";
  call_rate?: number;
}

const RingingCalls = () => {
  const client = useStreamVideoClient();
  const router = useRouter();
  const { authState } = useAuth();
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [callData, setCallData] = useState<IncomingCallData | null>(null);

  useEffect(() => {
    if (!client) return;

    console.log("[RingingCalls] Setting up incoming call listener");

    // Use the calls state to monitor for ringing calls
    const checkForIncomingCalls = () => {
      const calls = client.state.calls;
      console.log("[RingingCalls] Checking calls state:", calls.length);

      // Find any call that's ringing and not initiated by this user
      const ringingCall = calls.find((call) => {
        const callingState = call.state.callingState;
        const customData = call.state.custom as IncomingCallData;

        console.log(
          `[RingingCalls] Call ${call.id} - State: ${callingState}, Caller: ${customData?.caller_id}, MyId: ${authState.streamId}`
        );

        // Only show as incoming call if:
        // 1. Call is ringing
        // 2. This user is NOT the caller
        // 3. This user is in the call members (they are being called)
        const isRinging = callingState === CallingState.RINGING;
        const isNotCaller = customData?.caller_id !== authState.streamId;
        const isCallee = call.state.members.some(
          (member) => member.user_id === authState.streamId
        );

        const shouldShow = isRinging && isNotCaller && isCallee;

        if (shouldShow) {
          console.log(`[RingingCalls] This is a valid incoming call for me`);
        }

        return shouldShow;
      });

      if (
        ringingCall &&
        (!incomingCall || incomingCall.id !== ringingCall.id)
      ) {
        console.log("[RingingCalls] Found incoming call:", ringingCall.id);
        const customData = ringingCall.state.custom as IncomingCallData;
        setIncomingCall(ringingCall);
        setCallData(customData);
        Vibration.vibrate([0, 1000, 500, 1000], true);
      } else if (!ringingCall && incomingCall) {
        console.log("[RingingCalls] No more ringing calls, clearing state");
        setIncomingCall(null);
        setCallData(null);
        Vibration.cancel();
      }
    };

    // Check immediately
    checkForIncomingCalls();

    // Set up subscription to calls state changes
    const unsubscribe = client.state.calls$.subscribe(() => {
      checkForIncomingCalls();
    });

    return () => {
      console.log("[RingingCalls] Cleaning up listeners");
      unsubscribe.unsubscribe();
      Vibration.cancel();
    };
  }, [client, authState.streamId, incomingCall?.id]);

  const acceptCall = async () => {
    if (!incomingCall || !callData) return;

    console.log("[RingingCalls] Accepting call:", incomingCall.id);

    try {
      // Stop vibration
      Vibration.cancel();

      // Configure call settings based on intended mode
      if (callData.intended_call_mode === "audio") {
        await incomingCall.camera.disable();
        await incomingCall.microphone.enable();
      } else {
        await incomingCall.camera.enable();
        await incomingCall.microphone.enable();
      }

      // Accept the call
      await incomingCall.accept();

      // Navigate to consultation screen
      router.push({
        pathname: "/(app)/(authenticated)/consultation/[id]",
        params: {
          id: incomingCall.id,
          initialCallMode: callData.intended_call_mode,
          therapistName: callData.therapist_name,
          callRate: callData.call_rate?.toString(),
        },
      });

      // Clear the ringing state
      setIncomingCall(null);
      setCallData(null);
    } catch (error) {
      console.error("[RingingCalls] Error accepting call:", error);
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;

    console.log("[RingingCalls] Rejecting call:", incomingCall.id);

    try {
      // Stop vibration
      Vibration.cancel();

      // Reject the call
      await incomingCall.reject();

      // Clear the ringing state
      setIncomingCall(null);
      setCallData(null);
    } catch (error) {
      console.error("[RingingCalls] Error rejecting call:", error);
    }
  };

  if (!incomingCall || !callData) {
    return null;
  }

  const isVideoCall = callData.intended_call_mode === "video";

  return (
    <Modal visible={true} animationType="fade" presentationStyle="fullScreen">
      <StreamCall call={incomingCall}>
        <IncomingCallUI
          callData={callData}
          onAccept={acceptCall}
          onReject={rejectCall}
          isVideoCall={isVideoCall}
        />
      </StreamCall>
    </Modal>
  );
};

interface IncomingCallUIProps {
  callData: IncomingCallData;
  onAccept: () => void;
  onReject: () => void;
  isVideoCall: boolean;
}

const IncomingCallUI: React.FC<IncomingCallUIProps> = ({
  callData,
  onAccept,
  onReject,
  isVideoCall,
}) => {
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();

  // If call is no longer ringing, don't show UI
  if (callingState !== CallingState.RINGING) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A202C" />

      {/* Background */}
      <View style={styles.background}>
        {/* Animated ripples for visual effect */}
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
              <Ionicons name="person" size={80} color="rgba(255,255,255,0.9)" />
            </View>
            <View style={styles.pulsingRing} />
          </View>

          <Text style={styles.callerName}>
            {callData.caller_name || "Unknown Caller"}
          </Text>
          <Text style={styles.callerRole}>Client</Text>

          {callData.call_rate && (
            <Text style={styles.callRate}>{callData.call_rate} coins/min</Text>
          )}
        </View>

        {/* Call actions */}
        <View style={styles.actionsContainer}>
          {/* Reject button */}
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={onReject}
            activeOpacity={0.8}
          >
            <Ionicons name="call" size={32} color="white" />
          </TouchableOpacity>

          {/* Accept button */}
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={onAccept}
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

export default RingingCalls;
