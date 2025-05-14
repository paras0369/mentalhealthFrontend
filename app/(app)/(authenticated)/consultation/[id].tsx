// app/(app)/(authenticated)/consultation/[id].tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  useLocalSearchParams,
  useRouter,
  Stack,
  useFocusEffect,
} from "expo-router";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  AppState,
} from "react-native";
import {
  StreamCall,
  Call,
  useStreamVideoClient,
  CallContent,
  CallingState, // To observe call state
  // useCall, // Can be used inside CallContent's children if needed
  // useCallStateHooks, // Can be used for more granular state if CallContent isn't enough
} from "@stream-io/video-react-native-sdk";
import { CustomCallControls } from "@/components/CustomCallControls";
// import { useAuth } from "@/providers/AuthProvider"; // Only if therapist-specific actions within call needed

const LOG_PREFIX = "ConsultationPage";

const ConsultationPage = () => {
  const {
    id: callIdFromRoute,
    initialCallMode = "video", // Default to "video"
    // isInitiator, // Optional: if you want different behavior for caller vs callee on this screen
  } = useLocalSearchParams<{
    id: string;
    initialCallMode?: "audio" | "video";
    // isInitiator?: "true" | "false";
  }>();

  const router = useRouter();
  const videoClient = useStreamVideoClient();

  const [callObject, setCallObject] = useState<Call | null>(null);
  const [currentCallingState, setCurrentCallingState] = useState<CallingState>(
    CallingState.UNKNOWN
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const callStateSubscription = useRef<any>(null); // To store subscription

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

  // --- Effect to Setup and Join the Call ---
  useEffect(() => {
    if (!videoClient || !callIdFromRoute) {
      log("warn", "SetupCallEffect", "Video client or call ID missing.");
      setError("Required information to join the call is missing.");
      setIsLoading(false);
      return;
    }

    let unmounted = false;
    let currentCallInstance: Call | null = null;

    const initializeAndJoinCall = async () => {
      log(
        "log",
        "SetupCallEffect",
        `Initializing call object for ID: ${callIdFromRoute}`
      );
      // Use a generic call type or the one you expect
      currentCallInstance = videoClient.call("default", callIdFromRoute);
      setCallObject(currentCallInstance); // Set call object for StreamCall provider

      // Subscribe to call state changes
      if (callStateSubscription.current)
        callStateSubscription.current.unsubscribe();
      callStateSubscription.current =
        currentCallInstance.state.callingState$.subscribe((newState) => {
          if (unmounted) return;
          log("log", "CallStateUpdate", `Call state changed to: ${newState}`);
          setCurrentCallingState(newState);
          if (newState === CallingState.LEFT) {
            // If call ended externally or by other means
            log(
              "log",
              "CallStateUpdate",
              "Call LEFT. Navigating back or home."
            );
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }
        });

      try {
        log(
          "log",
          "SetupCallEffect",
          `Attempting to join call: ${currentCallInstance.id}`
        );
        // Attempt to join. If already joined (e.g., by RingingCallContent), this should be quick.
        // 'create: false' is safer if we assume RingingCallContent created it.
        // If this page can be entered for a call that might not exist yet, use 'create: true'.
        // For simplicity with RingingCallContent handling creation:
        await currentCallInstance.join({
          create: callIdFromRoute === currentCallInstance.id,
        }); // create if this component is the one "creating" it by ID

        if (unmounted) return;
        log(
          "log",
          "SetupCallEffect",
          `Successfully joined call: ${currentCallInstance.id}`
        );
        setIsLoading(false);
        setError(null);

        // Apply initial audio/video settings based on mode
        if (initialCallMode === "audio" && currentCallInstance.camera.enabled) {
          log("log", "SetupCallEffect", "Audio mode: Disabling camera.");
          await currentCallInstance.camera.disable();
        } else if (
          initialCallMode === "video" &&
          !currentCallInstance.camera.enabled
        ) {
          log("log", "SetupCallEffect", "Video mode: Enabling camera.");
          await currentCallInstance.camera.enable();
        }
      } catch (err: any) {
        log(
          "error",
          "SetupCallEffect",
          `Failed to join call ${currentCallInstance?.id}:`,
          err
        );
        if (!unmounted) {
          setError(err.message || "Failed to join the call.");
          setIsLoading(false);
          setCallObject(null); // Clear call object on error
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
      // Leaving the call on unmount is often NOT desired if user just backgrounds app.
      // Explicit hangup is usually better.
      // currentCallInstance?.leave().catch(e => log("error", "CleanupEffect", "Error leaving on unmount", e));
    };
  }, [videoClient, callIdFromRoute, initialCallMode, log, router]); // router added for navigation in subscription

  // --- App State Handling (Optional but good for camera/mic management) ---
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (!callObject || callObject.state.callingState !== CallingState.JOINED)
        return;

      log("log", "AppStateChange", `App state: ${nextAppState}`);
      if (initialCallMode === "video") {
        // Only manage camera for video calls
        if (nextAppState === "background" && callObject.camera.enabled) {
          log("log", "AppStateChange", "App backgrounded, disabling camera.");
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
        } else if (nextAppState === "active" && !callObject.camera.enabled) {
          log("log", "AppStateChange", "App active, re-enabling camera.");
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
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription.remove();
  }, [callObject, initialCallMode, log]);

  // --- User-initiated Hangup ---
  const handleHangup = useCallback(async () => {
    log("log", "HandleHangup", "User initiated hangup.");
    setIsLoading(true); // Show loading while leaving
    try {
      await callObject?.leave();
      log("log", "HandleHangup", "Successfully left call.");
      // Navigation will be handled by the state subscription detecting LEFT state
    } catch (e) {
      log("error", "HandleHangup", "Error leaving call:", e);
      // Still navigate back even if leave fails locally
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } finally {
      // setIsLoading(false); // State subscription will clear the screen
    }
  }, [callObject, router, log]);

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
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
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
    // If call ended, or couldn't be established properly, show an ended/error message
    // The subscription to LEFT state should navigate away, but this is a fallback.
    log(
      "log",
      "Render",
      `Call object null or state is ${currentCallingState}. Showing ended/fallback.`
    );
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.statusText}>
          {currentCallingState === CallingState.LEFT
            ? "Call has ended."
            : "Could not establish call."}
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        >
          <Text style={styles.buttonText}>Go Home</Text>
        </TouchableOpacity>
        <Stack.Screen options={{ title: "Call Ended" }} />
      </View>
    );
  }

  // Render the main call UI
  log(
    "log",
    "Render",
    `Rendering StreamCall for ${callObject.id}, current state: ${currentCallingState}`
  );
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Call: ${initialCallMode}` }} />
      <StreamCall call={callObject}>
        <CallContent
          onHangupCallHandler={handleHangup}
          CallControls={(props) => (
            <CustomCallControls {...props} callMode={initialCallMode} />
          )}
          // layout="grid" // or "spotlight" or remove for default
        />
      </StreamCall>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "white",
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
});

export default ConsultationPage;
