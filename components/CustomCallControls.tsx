// components/CustomCallControls.tsx
import React from "react";
import { View } from "react-native";
import {
  CallControlProps, // This is the type for props passed by CallContent
  ToggleAudioPublishingButton,
  ToggleCameraFaceButton,
  ReactionsButton,
  HangUpCallButton,
  ToggleVideoPublishingButton, // Added for completeness if needed for video calls
} from "@stream-io/video-react-native-sdk";
import { useAuth } from "@/providers/AuthProvider";

// Add callMode to the props type
interface CustomCallControlsProps extends CallControlProps {
  callMode: "audio" | "video";
}

export const CustomCallControls = (props: CustomCallControlsProps) => {
  const { isTherapist } = useAuth();
  const { callMode, onHangupCallHandler } = props;

  console.log(`[CustomCallControls] Rendering for mode: ${callMode}`);

  return (
    <View
      // Using basic inline styles for demonstration, replace with your NativeWind classes
      style={{
        position: "absolute",
        bottom: 40, // Increased bottom spacing
        left: "10%", // Centering trick
        right: "10%", // Centering trick
        width: "80%",
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 10,
        backgroundColor: "rgba(0, 0, 50, 0.7)", // Darker, semi-transparent
        borderRadius: 25, // More rounded
        elevation: 5,
        zIndex: 100, // Ensure it's on top
      }}
    >
      <ToggleAudioPublishingButton />

      {callMode === "video" && (
        // Only show video controls if it's a video call
        <>
          <ToggleVideoPublishingButton />
          <ToggleCameraFaceButton />
        </>
      )}

      {!isTherapist &&
        callMode === "video" && ( // Reactions might also make sense only for video
          <ReactionsButton />
        )}

      <HangUpCallButton onHangupCallHandler={onHangupCallHandler} />
    </View>
  );
};
