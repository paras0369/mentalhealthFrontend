// components/RingingCallsOverlay.tsx
import React, { useEffect } from "react"; // Import useEffect
import { SafeAreaView, StyleSheet, View, Text } from "react-native";
import {
  StreamCall,
  useCalls,
  RingingCallContent,
  CallingState, // Import CallingState enum for comparison
} from "@stream-io/video-react-native-sdk";

export const RingingCallsOverlay = () => {
  const calls = useCalls();

  // --- DETAILED LOGGING ---
  useEffect(() => {
    // Log whenever the calls list changes
    console.log(
      `[RingingCallsOverlay] useCalls updated. Found ${calls.length} calls.`
    );
    calls.forEach((c) => {
      console.log(
        ` - Call ID: ${c.id}, State: ${c.state.callingState}, Ringing: ${c.ringing}`
      );
    });
  }, [calls]); // Log whenever the calls array reference changes
  // --- END LOGGING ---

  // Filter for calls that are currently in the 'ringing' state
  // Ensure we are comparing with the correct enum value
  const ringingCalls = calls.filter(
    (c) => c.state.callingState === CallingState.RINGING
  );

  const activeRingingCall = ringingCalls[0]; // Handle only the first ringing call

  if (activeRingingCall) {
    console.log(
      `[RingingCallsOverlay] Rendering RingingCallContent for Call ID: ${activeRingingCall.id}`
    );
    return (
      <StreamCall call={activeRingingCall}>
        <SafeAreaView style={StyleSheet.absoluteFill}>
          <View style={styles.overlayContainer}>
            <RingingCallContent
            // Optional Props if needed:
            // onAcceptCallHandler={() => { console.log('Accept pressed'); activeRingingCall.join(); }}
            // onDeclineCallHandler={() => { console.log('Decline pressed'); activeRingingCall.leave({ reject: true }); }}
            />
          </View>
        </SafeAreaView>
      </StreamCall>
    );
  } else {
    // Don't log every time it's null, only when calls list changes (handled by useEffect)
    // console.log("[RingingCallsOverlay] No active ringing call.");
    return null; // Render nothing if no ringing call
  }
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    // backgroundColor: 'rgba(0, 0, 0, 0.3)', // Optional dimming background
  },
});

export default RingingCallsOverlay;
