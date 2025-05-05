import {
  Call,
  StreamCall,
  useStreamVideoClient,
  CallingState,
  CallContent,
} from "@stream-io/video-react-native-sdk";
import { useEffect, useState, useCallback } from "react"; // Added useCallback
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  View,
  Text,
  PermissionsAndroid,
  ActivityIndicator,
  Alert,
} from "react-native"; // Added ActivityIndicator, Alert
import { CustomCallControls } from "@/components/CustomCallControls";
import { useAuth } from "@/providers/AuthProvider";
import React from "react";

// PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS); // Keep commented unless setting up notifications

const ConsultationCallPage = () => {
  const { id: callIdFromRoute } = useLocalSearchParams<{ id: string }>();
  const [call, setCall] = useState<Call | null>(null);
  const router = useRouter();
  const client = useStreamVideoClient();
  const { authState, isTherapist } = useAuth(); // Get authState for user ID if needed later

  // --- Join/Create Stream Call Effect ---
  useEffect(() => {
    if (!client || !callIdFromRoute) {
      console.log("Video Call Screen: Client not ready or Call ID missing.");
      return;
    }
    // Check if already connected to this call to prevent rejoining loops
    if (call && call.id === callIdFromRoute) {
      console.log("Video Call Screen: Already managing call", callIdFromRoute);
      return;
    }

    console.log(
      `Video Call Screen: Attempting to join/create call with ID: ${callIdFromRoute}`
    );
    const currentCall = client.call("default", callIdFromRoute);

    currentCall
      .join({ create: true })
      .then(() => {
        console.log(`Successfully joined call ${callIdFromRoute}`);
        setCall(currentCall); // Set the active call object

        if (isTherapist) {
          console.log(
            "Therapist joined, attempting to start recording/transcription..."
          );
          currentCall
            .startRecording()
            .catch((err) => console.error("Failed to start recording:", err));
          currentCall
            .startTranscription()
            .catch((err) =>
              console.error("Failed to start transcription:", err)
            );
        }
      })
      .catch((err) => {
        console.error(`Failed to join call ${callIdFromRoute}:`, err);
        Alert.alert(
          "Error Joining Call",
          err?.message || "Could not connect to the call.",
          [
            {
              text: "OK",
              onPress: () => {
                if (router.canGoBack()) router.back();
                else router.replace("/");
              },
            },
          ]
        );
      });

    // Set call instance immediately to potentially allow early state reading if needed
    // setCall(currentCall); // Be cautious with setting state before promise resolves

    // --- Call Leave Cleanup ---
    return () => {
      // IMPORTANT: Use a function form of setCall to access the correct 'currentCall' instance
      // bound to this specific effect invocation, avoiding stale state issues in cleanup.
      setCall((prevCall) => {
        // Check if the call instance we are trying to clean up is the one currently in state
        if (
          prevCall &&
          prevCall.id === currentCall.id &&
          prevCall.state.callingState !== CallingState.LEFT
        ) {
          console.log(`useEffect cleanup: Leaving call ${currentCall.id}...`);
          if (isTherapist) {
            currentCall
              .stopRecording()
              .catch((err) =>
                console.error("Cleanup: Error stopping recording:", err)
              );
            currentCall
              .stopTranscription()
              .catch((err) =>
                console.error("Cleanup: Error stopping transcription:", err)
              );
          }
          currentCall
            .leave()
            .catch((err) => console.error("Cleanup: Error leaving call:", err));
          return null; // Clear the call state after initiating leave
        }
        return prevCall; // Keep existing state if it's not the call from this effect run
      });
    };
  }, [client, callIdFromRoute, isTherapist]); // Rerun if client or call ID changes

  // --- Custom Hangup Handler ---
  const handleHangup = useCallback(() => {
    console.log("Hangup button pressed. Initiating navigation back...");
    // ONLY navigate back. The useEffect cleanup will handle leaving the call
    // when the component unmounts due to navigation.
    if (router.canGoBack()) {
      console.log("Navigating back.");
      router.back();
    } else {
      console.log("Cannot go back, replacing with home.");
      router.replace("/"); // Replace with home or appropriate default screen
    }
  }, [router]); // Only depends on router now

  // --- Render Logic ---

  // Show loading state until the call object is successfully joined and set in state
  if (
    !call ||
    call.state.callingState === CallingState.JOINING ||
    call.state.callingState === CallingState.UNKNOWN ||
    call.state.callingState === CallingState.IDLE
  ) {
    // Added more states to cover the joining process
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={{ marginTop: 10, color: "grey", fontSize: 16 }}>
          {call?.state.callingState === CallingState.JOINING
            ? "Joining Call..."
            : "Connecting..."}
        </Text>
        {/* Set a static title while loading */}
        <Stack.Screen options={{ title: "Connecting..." }} />
      </View>
    );
  }

  // Render the Stream Call UI once the call object is ready and joined
  return (
    <View style={{ flex: 1 }}>
      {/* Set title dynamically once call is active */}
      <Stack.Screen options={{ title: `Call Active` }} />
      {/* Provide the active call instance to StreamCall context */}
      <StreamCall call={call}>
        <CallContent
          layout="spotlight" // Or 'grid', 'speaker'
          // --- Pass the custom hangup handler ---
          onHangupCallHandler={handleHangup}
          // --- Use your custom controls ---
          CallControls={CustomCallControls}
        />
      </StreamCall>
    </View>
  );
};
export default ConsultationCallPage;
