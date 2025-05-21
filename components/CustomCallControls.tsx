// components/CustomCallControls.tsx
import React, { useState, useEffect } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import {
  CallControlProps,
  ToggleAudioPublishingButton,
  ToggleCameraFaceButton,
  HangUpCallButton,
  ToggleVideoPublishingButton,
  // ReactionsButton, // Keep if needed for video
} from "@stream-io/video-react-native-sdk";
import { useAuth } from "@/providers/AuthProvider";
import { Ionicons } from "@expo/vector-icons";
import InCallManager from "react-native-incall-manager";

interface CustomCallControlsProps extends CallControlProps {
  callMode: "audio" | "video";
}

export const CustomCallControls = (props: CustomCallControlsProps) => {
  const { isTherapist } = useAuth(); // Not used in this version, but kept if needed later
  const { callMode, onHangupCallHandler } = props;
  const [isSpeakerphoneOn, setIsSpeakerphoneOn] = useState(
    callMode === "video"
  ); // Default speaker for video

  useEffect(() => {
    // Set initial speaker state based on call mode when component mounts
    // For audio calls, default to earpiece (speaker OFF)
    // For video calls, default to speaker ON
    const initialSpeakerState = callMode === "video";
    InCallManager.setForceSpeakerphoneOn(initialSpeakerState);
    setIsSpeakerphoneOn(initialSpeakerState);
    console.log(
      `[CustomCallControls] Initialized InCallManager speaker to: ${
        initialSpeakerState ? "ON" : "OFF"
      } for ${callMode} call`
    );

    // Important: Stop InCallManager when the call ends (component unmounts or call leaves)
    // This is usually handled if `CallContent` is unmounted or if you manually stop it
    // when `onHangupCallHandler` leads to call leaving.
    // For safety, you might call InCallManager.stop() in a cleanup if this component unmounts
    // while a call was active.
  }, [callMode]);

  const toggleSpeakerphone = () => {
    const newSpeakerState = !isSpeakerphoneOn;
    InCallManager.setForceSpeakerphoneOn(newSpeakerState);
    setIsSpeakerphoneOn(newSpeakerState);
    console.log(
      `[CustomCallControls] Toggled speaker to: ${
        newSpeakerState ? "ON" : "OFF"
      }`
    );
  };

  return (
    <View style={styles.container}>
      {/* Speaker Toggle Button - Always show for audio, optional for video */}
      {/* For audio calls, this is crucial */}
      <TouchableOpacity
        onPress={toggleSpeakerphone}
        style={styles.controlButton}
      >
        <Ionicons
          name={isSpeakerphoneOn ? "volume-high" : "volume-mute"} // Or "volume-medium" for earpiece
          size={28}
          color="white"
        />
      </TouchableOpacity>

      <ToggleAudioPublishingButton />

      {callMode === "video" && (
        <>
          <ToggleVideoPublishingButton />
          <ToggleCameraFaceButton />
          {/* {!isTherapist && <ReactionsButton />} */}
        </>
      )}

      <HangUpCallButton onHangupCallHandler={onHangupCallHandler} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 40,
    left: "10%",
    right: "10%",
    width: "80%",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0, 0, 0, 0.6)", // Slightly more opaque
    borderRadius: 30, // More rounded
    elevation: 5,
    zIndex: 100,
  },
  controlButton: {
    // Style for custom buttons like speaker
    padding: 10, // Ensure it's touchable
  },
});
