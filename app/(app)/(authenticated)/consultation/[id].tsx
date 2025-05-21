// app/(app)/(authenticated)/consultation/[id].tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  AppState,
  SafeAreaView,
  Image, // For avatars in future
} from "react-native";
import {
  StreamCall,
  Call,
  useStreamVideoClient,
  CallContent,
  CallingState,
  useCallStateHooks,
  StreamVideoParticipant, // Type for participant object
  useCall, // Hook to get the call object within StreamCall context
} from "@stream-io/video-react-native-sdk";
import { CustomCallControls } from "@/components/CustomCallControls";
import { CallDurationBadge } from "@/components/CallDurationBadge";
import { useAuth } from "@/providers/AuthProvider";
import { Ionicons } from "@expo/vector-icons";
import InCallManager from "react-native-incall-manager";

const LOG_PREFIX = "ConsultationPage";

const ConsultationPage = () => {
  const {
    id: callIdFromRoute,
    initialCallMode = "video", // Default to "video" if not provided
  } = useLocalSearchParams<{
    id: string;
    initialCallMode?: "audio" | "video";
  }>();

  const router = useRouter();
  const videoClient = useStreamVideoClient(); // Get the video client from context
  const { authState } = useAuth();

  const [callObject, setCallObject] = useState<Call | null>(null);
  const [currentCallingState, setCurrentCallingState] = useState<CallingState>(
    CallingState.UNKNOWN
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref to store the subscription to call state changes
  const callStateSubscription = useRef<{ unsubscribe: () => void } | null>(
    null
  );

  // Memoized logging function
  const log = useCallback(
    (
      level: "log" | "warn" | "error",
      context: string,
      message: string,
      ...args: any[]
    ) => {
      const fullMessage = `[${LOG_PREFIX}:${context}${
        callIdFromRoute ? `:${callIdFromRoute}` : ""
      }] ${message}`;
      console[level](fullMessage, ...args);
    },
    [callIdFromRoute]
  );

  // Effect to initialize, join the call, and manage camera/mic based on mode
  useEffect(() => {
    if (!videoClient) {
      log("warn", "SetupCallEffect", "Video client is not available yet.");
      // setError("Video client not ready."); // Optionally set error
      // setIsLoading(false); // Optionally stop loading
      return; // Wait for videoClient
    }
    if (!callIdFromRoute) {
      log("error", "SetupCallEffect", "Call ID is missing from route params.");
      setError("Call ID missing.");
      setIsLoading(false);
      return;
    }

    let unmounted = false;
    let currentCallInstance: Call; // Use non-nullable Call type here

    const initializeAndJoinCall = async () => {
      log(
        "log",
        "SetupCallEffect",
        `Initializing for callId: ${callIdFromRoute}, mode: ${initialCallMode}`
      );

      // Create or get the call instance
      currentCallInstance = videoClient.call("default", callIdFromRoute);
      setCallObject(currentCallInstance); // Provide call object to StreamCall

      // Subscribe to call state changes
      if (callStateSubscription.current) {
        callStateSubscription.current.unsubscribe();
      }
      callStateSubscription.current =
        currentCallInstance.state.callingState$.subscribe((newState) => {
          if (unmounted) return;
          log("log", "CallStateUpdate", `New calling state: ${newState}`);
          setCurrentCallingState(newState);

          if (newState === CallingState.LEFT) {
            log(
              "log",
              "CallStateUpdate",
              "Call state is LEFT. Stopping InCallManager and navigating."
            );
            InCallManager.stop();
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(app)/(authenticated)/(tabs)"); // Fallback navigation
            }
          }
        });

      try {
        log("log", "SetupCallEffect", "Attempting to join/create call...");
        // Join the call (or create if it doesn't exist)
        // The `ring: false` is important here if the call was already initiated (e.g. by RingingCallContent)
        // and you're just joining the ongoing session.
        // If this screen can be the first to "create" a non-ringing call, `create: true` is fine.
        await currentCallInstance.join({ create: true });
        if (unmounted) return;
        log("log", "SetupCallEffect", "Successfully joined call.");

        // Start InCallManager AFTER successful join
        InCallManager.start({ media: initialCallMode });
        log(
          "log",
          "SetupCallEffect",
          `InCallManager started with media type: ${initialCallMode}`
        );

        if (initialCallMode === "audio") {
          log("log", "SetupCallEffect", "Audio call mode selected.");
          if (currentCallInstance.camera.state.status === "enabled") {
            log(
              "log",
              "SetupCallEffect",
              "Camera is ON, disabling for audio call..."
            );
            await currentCallInstance.camera.disable();
            log("log", "SetupCallEffect", "Camera disabled for audio call.");
          } else {
            log(
              "log",
              "SetupCallEffect",
              "Camera is already OFF for audio call."
            );
          }
          // Ensure microphone is enabled by default for audio call (can be toggled by user)
          if (currentCallInstance.microphone.state.status === "disabled") {
            log(
              "log",
              "SetupCallEffect",
              "Microphone is OFF, enabling for audio call..."
            );
            await currentCallInstance.microphone.enable();
          }
          InCallManager.setForceSpeakerphoneOn(false); // Default to earpiece for audio
          log(
            "log",
            "SetupCallEffect",
            "Speakerphone set to OFF (earpiece) for audio call."
          );
        } else {
          // Video call mode
          log("log", "SetupCallEffect", "Video call mode selected.");
          if (currentCallInstance.camera.state.status === "disabled") {
            log(
              "log",
              "SetupCallEffect",
              "Camera is OFF, enabling for video call..."
            );
            await currentCallInstance.camera.enable();
            log("log", "SetupCallEffect", "Camera enabled for video call.");
          } else {
            log(
              "log",
              "SetupCallEffect",
              "Camera is already ON for video call."
            );
          }
          // Ensure microphone is enabled by default for video call
          if (currentCallInstance.microphone.state.status === "disabled") {
            await currentCallInstance.microphone.enable();
          }
          InCallManager.setForceSpeakerphoneOn(true); // Default to speaker for video
          log(
            "log",
            "SetupCallEffect",
            "Speakerphone set to ON for video call."
          );
        }

        setIsLoading(false);
        setError(null);
      } catch (err: any) {
        log(
          "error",
          "SetupCallEffect",
          `Failed to join call ${currentCallInstance?.id}:`,
          err.message,
          err
        );
        if (!unmounted) {
          setError(err.message || "Failed to join the call.");
          setIsLoading(false);
          setCallObject(null); // Clear call object on error
          InCallManager.stop(); // Stop InCallManager if join fails
        }
      }
    };

    initializeAndJoinCall();

    return () => {
      unmounted = true;
      log(
        "log",
        "CleanupEffect",
        `Unmounting ConsultationPage for call ${currentCallInstance?.id}.`
      );
      if (callStateSubscription.current) {
        callStateSubscription.current.unsubscribe();
        callStateSubscription.current = null;
      }
      // If call is still active and component unmounts unexpectedly (e.g., navigating away without hangup)
      // The LEFT state handler should ideally manage InCallManager.stop().
      // However, if there's a risk of it not being called, consider:
      // if (currentCallInstance && currentCallInstance.state.callingState === CallingState.JOINED) {
      //   log("warn", "CleanupEffect", "Call still joined on unmount, stopping InCallManager as a precaution.");
      //   InCallManager.stop();
      // }
    };
  }, [videoClient, callIdFromRoute, initialCallMode, log, router]); // Added API_URL back if log needs it

  // App State Handling (primarily for video camera)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (
        !callObject ||
        callObject.state.callingState !== CallingState.JOINED ||
        initialCallMode !== "video"
      ) {
        return;
      }

      log("log", "AppStateChange", `App state changed to: ${nextAppState}`);
      if (nextAppState.match(/inactive|background/)) {
        if (callObject.camera.state.status === "enabled") {
          log(
            "log",
            "AppStateChange",
            "App backgrounded (video call), disabling camera."
          );
          await callObject.camera
            .disable()
            .catch((e) =>
              log(
                "warn",
                "AppStateChange",
                "Error disabling camera on background",
                e
              )
            );
        }
      } else if (nextAppState === "active") {
        if (callObject.camera.state.status === "disabled") {
          // Only enable if it was disabled by this mechanism
          log(
            "log",
            "AppStateChange",
            "App active (video call), re-enabling camera."
          );
          await callObject.camera
            .enable()
            .catch((e) =>
              log(
                "warn",
                "AppStateChange",
                "Error enabling camera on active",
                e
              )
            );
        }
      }
    };
    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => appStateSubscription.remove();
  }, [callObject, initialCallMode, log]);

  const handleHangup = useCallback(async () => {
    log("log", "HandleHangup", "User initiated hangup.");
    if (!callObject) {
      log("warn", "HandleHangup", "Call object is null, cannot leave.");
      // Navigate back if no call object
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/(authenticated)/(tabs)");
      return;
    }
    setIsLoading(true); // Show loading indicator while leaving
    try {
      await callObject.leave(); // This should trigger the CallingState.LEFT subscription
      log("log", "HandleHangup", "call.leave() executed.");
      // Navigation is now handled by the LEFT state subscription
    } catch (e: any) {
      log("error", "HandleHangup", "Error leaving call:", e.message);
      // Fallback navigation if leave() fails or subscription doesn't trigger nav quickly
      InCallManager.stop(); // Ensure InCallManager is stopped
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/(authenticated)/(tabs)");
      setIsLoading(false); // Reset loading state on error
    }
  }, [callObject, router, log]);

  // --- Custom UI for Audio Calls ---
  const AudioCallUIComponent = () => {
    const call = useCall(); // Get call from StreamCall context
    const { useParticipants, useLocalParticipant } = useCallStateHooks();
    const participants = useParticipants();
    const localParticipant = useLocalParticipant();

    // Determine the other party
    const remoteParticipants = participants.filter(
      (p: StreamVideoParticipant) => p.sessionId !== localParticipant?.sessionId
    );
    const otherParty: StreamVideoParticipant | undefined =
      remoteParticipants[0];

    const otherPartyName =
      otherParty?.name || otherParty?.userId || "Connecting...";
    const yourName = authState.name || authState.email || "You";

    return (
      <SafeAreaView style={styles.audioCallContainer}>
        <View style={styles.headerInfo}>
          {call && call.state.callingState === CallingState.JOINED && (
            <CallDurationBadge
              textClassName="text-lg text-white"
              iconColor="white"
              iconSize={20}
            />
          )}
        </View>

        <View style={styles.participantsInfo}>
          {/* Other Party Display */}
          <View style={styles.participantDisplay}>
            <View style={styles.avatarPlaceholder}>
              <Ionicons
                name="person-outline"
                size={80}
                color="rgba(255,255,255,0.7)"
              />
            </View>
            <Text style={styles.participantName}>{otherPartyName}</Text>
            <Text style={styles.participantRoleHint}>
              {authState.isTherapist ? "Client" : "Therapist"}
            </Text>
          </View>

          {/* Your Display */}
          <View style={styles.participantDisplayMe}>
            <Text style={styles.yourIdentifier}>You</Text>
            <Text style={styles.yourName}>{yourName}</Text>
          </View>
        </View>
        {/* CallControls are rendered outside, overlaid */}
      </SafeAreaView>
    );
  };

  // --- Render Logic ---
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={styles.statusText}>
          {currentCallingState === CallingState.JOINING
            ? "Joining Call..."
            : "Loading Call..."}
        </Text>
        <Stack.Screen options={{ title: "Connecting..." }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            InCallManager.stop(); // Ensure manager is stopped
            router.canGoBack()
              ? router.back()
              : router.replace("/(app)/(authenticated)/(tabs)");
          }}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
        <Stack.Screen options={{ title: "Error" }} />
      </View>
    );
  }

  if (
    !callObject ||
    currentCallingState === CallingState.LEFT ||
    currentCallingState === CallingState.UNKNOWN
  ) {
    log(
      "warn",
      "Render",
      `Call object null or state is ${currentCallingState}. Showing ended/fallback UI.`
    );
    // This state should ideally be caught by the LEFT subscription, but good fallback
    InCallManager.stop(); // Ensure manager is stopped
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.statusText}>
          {currentCallingState === CallingState.LEFT
            ? "Call has ended."
            : "Could not establish call connection."}
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(app)/(authenticated)/(tabs)")
          }
        >
          <Text style={styles.buttonText}>Go Home</Text>
        </TouchableOpacity>
        <Stack.Screen options={{ title: "Call Ended" }} />
      </View>
    );
  }

  // Main render based on call mode
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `${
            initialCallMode.charAt(0).toUpperCase() + initialCallMode.slice(1)
          } Call`,
        }}
      />
      <StreamCall call={callObject}>
        {initialCallMode === "audio" ? (
          <>
            <AudioCallUIComponent />
            <CustomCallControls
              onHangupCallHandler={handleHangup}
              callMode="audio"
            />
          </>
        ) : (
          // Video Call
          <CallContent
            onHangupCallHandler={handleHangup}
            CallControls={(props) => (
              <CustomCallControls {...props} callMode="video" />
            )}
            // You can add other CallContent props here if needed
            // layout="grid" // or "spotlight"
          />
        )}
      </StreamCall>
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" }, // Main container for the whole screen
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "white", // For loading/error states
  },
  statusText: { marginTop: 10, fontSize: 16, color: "grey" },
  errorText: { marginTop: 10, fontSize: 16, color: "red", textAlign: "center" },
  button: {
    marginTop: 20,
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "bold" },

  // Styles for AudioCallUIComponent
  audioCallContainer: {
    flex: 1, // Takes up all available space within its parent (StreamCall)
    justifyContent: "space-around", // Distributes space for header, participants, self-info
    alignItems: "center",
    backgroundColor: "#1A202C", // Darker, slightly blueish grey (like dark mode slate-800/900)
    paddingTop: 60, // Space for status bar and header elements
    paddingBottom: 120, // Space for controls at the bottom
  },
  headerInfo: {
    position: "absolute", // Keep it at the top
    // top: Platform.OS === "ios" ? 60 : 30, // Adjust for status bar height
    alignSelf: "center", // Center the duration badge
  },
  participantsInfo: {
    flex: 1, // Allow this section to grow
    justifyContent: "center", // Center main participant info vertically
    alignItems: "center",
    width: "100%",
  },
  participantDisplay: {
    alignItems: "center",
    marginBottom: 40, // Space between other party and self-identifier
  },
  avatarPlaceholder: {
    width: 160, // Larger avatar
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.08)", // More subtle placeholder
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
  },
  participantName: {
    fontSize: 28, // Larger name
    fontWeight: "600", // Semi-bold
    color: "white",
    textAlign: "center",
    marginBottom: 4,
  },
  participantRoleHint: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
  },
  participantDisplayMe: {
    // Positioned towards the bottom, above controls
    alignItems: "center",
    // Removed absolute positioning to let flexbox handle it better with space-around
  },
  yourIdentifier: {
    fontSize: 22,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
  },
  yourName: {
    fontSize: 15,
    color: "rgba(255,255,255,0.55)",
    marginTop: 3,
  },
});

export default ConsultationPage;
