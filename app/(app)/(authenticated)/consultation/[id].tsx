// app/(app)/(authenticated)/consultation/[id].tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  AppState,
  SafeAreaView,
  Dimensions,
  StatusBar,
  Alert,
} from "react-native";
import {
  StreamCall,
  Call,
  useStreamVideoClient,
  CallingState,
  useCallStateHooks,
  StreamVideoParticipant,
  useCall,
  ParticipantView,
  CallControls,
} from "@stream-io/video-react-native-sdk";
import { CustomCallControls } from "@/components/CustomCallControls";
import { CallDurationBadge } from "@/components/CallDurationBadge";
import { useAuth } from "@/providers/AuthProvider";
import { Ionicons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");
const LOG_PREFIX = "ConsultationPage";

const ConsultationPage = () => {
  const {
    id: callIdFromRoute,
    initialCallMode = "video",
    therapistId,
    therapistName,
    callRate,
  } = useLocalSearchParams<{
    id: string;
    initialCallMode?: "audio" | "video";
    therapistId?: string;
    therapistName?: string;
    callRate?: string;
  }>();

  const router = useRouter();
  const videoClient = useStreamVideoClient();
  const { authState } = useAuth();

  const [callObject, setCallObject] = useState<Call | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCallReady, setIsCallReady] = useState(false);

  const mountedRef = useRef(true);
  const hasJoinedRef = useRef(false);

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

  // Initialize and join call
  useEffect(() => {
    let stateUnsubscribe: (() => void) | null = null;

    const initializeCall = async () => {
      if (!videoClient || !callIdFromRoute || !mountedRef.current) {
        log("error", "Init", "Missing video client or call ID");
        setError("Unable to initialize call");
        setIsLoading(false);
        return;
      }

      try {
        log(
          "log",
          "Init",
          `Initializing call: ${callIdFromRoute}, mode: ${initialCallMode}`
        );

        // Create call instance
        const call = videoClient.call("default", callIdFromRoute);

        // Set up call state subscription before joining
        const subscription = call.state.callingState$.subscribe((newState) => {
          if (!mountedRef.current) return;

          log("log", "StateChange", `Call state: ${newState}`);

          if (newState === CallingState.JOINED && !hasJoinedRef.current) {
            hasJoinedRef.current = true;
            setIsCallReady(true);
            setIsLoading(false);
            log("log", "StateChange", "Call successfully joined and ready");
          } else if (newState === CallingState.LEFT) {
            log("log", "StateChange", "Call ended, navigating back");
            handleCallEnd();
          }
        });
        stateUnsubscribe = () => subscription.unsubscribe();

        // Configure call settings before joining
        if (initialCallMode === "audio") {
          await call.camera.disable();
          await call.microphone.enable();
        } else {
          await call.camera.enable();
          await call.microphone.enable();
        }

        // Set the call object first
        setCallObject(call);

        // Handle different scenarios with the simplified approach:
        // 1. Caller: Call should exist now since we create before navigating
        // 2. Callee: Call exists and we need to join it

        try {
          // Try to get the existing call
          await call.get();
          log("log", "Init", "Call exists, joining...");

          // Join the call directly
          await call.join();
        } catch (getError) {
          log("log", "Init", "Call doesn't exist yet, retrying...");

          // For video calls especially, there might be a slight delay
          // Retry a few times with shorter intervals
          let attempts = 0;
          const maxAttempts = 20; // 2 seconds total with 100ms intervals
          let callFound = false;

          while (attempts < maxAttempts && mountedRef.current && !callFound) {
            try {
              await call.get();
              log(
                "log",
                "Init",
                `Call found on attempt ${attempts + 1}, joining...`
              );
              await call.join();
              callFound = true;
              break;
            } catch (error) {
              attempts++;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }

          if (!callFound) {
            throw new Error(
              "Call was not found after multiple attempts. Please try again."
            );
          }
        }
        log("log", "Init", "Call join initiated");
      } catch (err: any) {
        log("error", "Init", "Failed to initialize call:", err);
        if (mountedRef.current) {
          setError(err.message || "Failed to join call");
          setIsLoading(false);
        }
      }
    };

    initializeCall();

    return () => {
      mountedRef.current = false;
      if (stateUnsubscribe) {
        stateUnsubscribe();
      }
    };
  }, [
    videoClient,
    callIdFromRoute,
    initialCallMode,
    authState.streamId,
    authState.email,
    therapistName,
    callRate,
    log,
  ]);

  // App state management for video calls
  useEffect(() => {
    if (initialCallMode !== "video" || !callObject) return;

    const handleAppStateChange = async (nextAppState: string) => {
      if (!isCallReady) return;

      log("log", "AppState", `App state: ${nextAppState}`);

      try {
        if (nextAppState.match(/inactive|background/)) {
          await callObject.camera.disable();
        } else if (nextAppState === "active") {
          await callObject.camera.enable();
        }
      } catch (error: any) {
        log("warn", "AppState", "Camera toggle error:", error);
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription?.remove();
  }, [callObject, isCallReady, initialCallMode, log]);

  const handleCallEnd = useCallback(() => {
    log("log", "HandleEnd", "Handling call end");
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/(authenticated)/(tabs)");
    }
  }, [router, log]);

  const handleHangup = useCallback(async () => {
    if (!callObject) {
      handleCallEnd();
      return;
    }

    log("log", "Hangup", "User initiated hangup");

    try {
      // Check if call is still active before trying to leave
      if (callObject.state.callingState !== CallingState.LEFT) {
        await callObject.leave();
        log("log", "Hangup", "Successfully left call");
      }
    } catch (err: any) {
      log("error", "Hangup", "Leave call error:", err);
    } finally {
      // Always navigate back after hangup attempt
      handleCallEnd();
    }
  }, [callObject, handleCallEnd, log]);

  // Custom Audio Call UI Component
  const CustomAudioCallUI = () => {
    const call = useCall();
    const { useParticipants, useLocalParticipant, useCallCallingState } =
      useCallStateHooks();
    const participants = useParticipants();
    const localParticipant = useLocalParticipant();
    const callingState = useCallCallingState();

    const remoteParticipant = participants.find(
      (p) => p.sessionId !== localParticipant?.sessionId
    );

    const getParticipantName = (participant?: StreamVideoParticipant) => {
      return (
        participant?.name || participant?.userId || therapistName || "Unknown"
      );
    };

    return (
      <SafeAreaView style={styles.audioContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1A202C" />

        {/* Animated background */}
        <View style={styles.audioBackground}>
          <View style={[styles.ripple, styles.ripple1]} />
          <View style={[styles.ripple, styles.ripple2]} />
          <View style={[styles.ripple, styles.ripple3]} />
        </View>

        {/* Header with call info */}
        <View style={styles.audioHeader}>
          <Text style={styles.audioCallLabel}>Audio Call</Text>
          {callingState === CallingState.JOINED && (
            <CallDurationBadge
              textClassName="text-lg text-white"
              iconColor="white"
              iconSize={20}
            />
          )}
        </View>

        {/* Main content */}
        <View style={styles.audioMainContent}>
          {/* Remote participant display */}
          <View style={styles.remoteParticipantSection}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Ionicons
                  name="person"
                  size={60}
                  color="rgba(255,255,255,0.8)"
                />
              </View>
              {remoteParticipant?.isSpeaking && (
                <View style={styles.speakingRing} />
              )}
            </View>

            <Text style={styles.remoteParticipantName}>
              {remoteParticipant
                ? getParticipantName(remoteParticipant)
                : "Connecting..."}
            </Text>
            <Text style={styles.participantRole}>
              {authState.isTherapist ? "Client" : "Therapist"}
            </Text>

            {/* Connection status */}
            <View style={styles.statusContainer}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      callingState === CallingState.JOINED
                        ? "#10B981"
                        : "#F59E0B",
                  },
                ]}
              />
              <Text style={styles.statusText}>
                {callingState === CallingState.JOINED
                  ? "Connected"
                  : "Connecting..."}
              </Text>
            </View>
          </View>

          {/* Local participant info */}
          <View style={styles.localParticipantSection}>
            <Text style={styles.localParticipantLabel}>You</Text>
            <Text style={styles.localParticipantName}>
              {authState.name || authState.email || "You"}
            </Text>
            {localParticipant?.isSpeaking && (
              <Text style={styles.speakingIndicator}>Speaking...</Text>
            )}
          </View>
        </View>

        {/* Custom controls */}
        <View style={styles.controlsContainer}>
          <CustomCallControls
            onHangupCallHandler={handleHangup}
            callMode="audio"
          />
        </View>
      </SafeAreaView>
    );
  };

  // Custom Video Call UI Component
  const CustomVideoCallUI = () => {
    const call = useCall();
    const { useParticipants, useLocalParticipant, useCallCallingState } =
      useCallStateHooks();
    const participants = useParticipants();
    const localParticipant = useLocalParticipant();
    const callingState = useCallCallingState();

    const remoteParticipant = participants.find(
      (p) => p.sessionId !== localParticipant?.sessionId
    );

    const renderVideoLayout = () => {
      if (!remoteParticipant) {
        // Only local participant - waiting state
        return (
          <View style={styles.waitingContainer}>
            <View style={styles.localVideoLarge}>
              {localParticipant && (
                <ParticipantView
                  participant={localParticipant}
                  style={styles.participantVideoFull}
                />
              )}
              <View style={styles.waitingOverlay}>
                <Text style={styles.waitingText}>
                  Waiting for {therapistName || "other participant"}...
                </Text>
              </View>
            </View>
          </View>
        );
      }

      // Two participants - main + pip layout
      return (
        <View style={styles.dualVideoContainer}>
          {/* Main video - remote participant */}
          <View style={styles.mainVideo}>
            <ParticipantView
              participant={remoteParticipant}
              style={styles.participantVideoFull}
            />
            <View style={styles.mainVideoOverlay}>
              <Text style={styles.participantLabel}>
                {remoteParticipant.name ||
                  remoteParticipant.userId ||
                  therapistName ||
                  "Other Participant"}
              </Text>
              {remoteParticipant.isSpeaking && (
                <View style={styles.speakingDot} />
              )}
            </View>
          </View>

          {/* Picture-in-picture - local participant */}
          {localParticipant && (
            <View style={styles.pipVideo}>
              <ParticipantView
                participant={localParticipant}
                style={styles.participantVideoFull}
              />
              <Text style={styles.pipLabel}>You</Text>
              {localParticipant.isSpeaking && (
                <View style={[styles.speakingDot, styles.pipSpeakingDot]} />
              )}
            </View>
          )}
        </View>
      );
    };

    return (
      <View style={styles.videoContainer}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />

        {/* Custom header */}
        <View style={styles.videoHeader}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => console.log("Minimize")}
          >
            <Ionicons name="chevron-down" size={24} color="white" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Video Call</Text>
            {callingState === CallingState.JOINED && (
              <CallDurationBadge
                textClassName="text-sm text-white opacity-80"
                iconColor="white"
                iconSize={16}
              />
            )}
          </View>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => console.log("Menu")}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* Video content */}
        <View style={styles.videoContent}>{renderVideoLayout()}</View>

        {/* Connection status */}
        {callingState !== CallingState.JOINED && (
          <View style={styles.connectionBanner}>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.connectionText}>
              {callingState === CallingState.JOINING
                ? "Connecting..."
                : "Establishing connection..."}
            </Text>
          </View>
        )}

        {/* Custom controls */}
        <View style={styles.controlsContainer}>
          <CustomCallControls
            onHangupCallHandler={handleHangup}
            callMode="video"
          />
        </View>
      </View>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={styles.loadingText}>
          {callObject ? "Joining call..." : "Initializing..."}
        </Text>
        <Stack.Screen
          options={{ title: "Connecting...", headerShown: false }}
        />
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning" size={48} color="#EF4444" />
        <Text style={styles.errorTitle}>Connection Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.errorButton} onPress={handleCallEnd}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
        <Stack.Screen options={{ title: "Error", headerShown: false }} />
      </View>
    );
  }

  // No call object
  if (!callObject) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="call-outline" size={48} color="#6B7280" />
        <Text style={styles.errorTitle}>Call Not Found</Text>
        <Text style={styles.errorMessage}>
          Unable to find the requested call.
        </Text>
        <TouchableOpacity style={styles.errorButton} onPress={handleCallEnd}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
        <Stack.Screen
          options={{ title: "Call Not Found", headerShown: false }}
        />
      </View>
    );
  }

  // Main render with custom UI
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `${
            initialCallMode.charAt(0).toUpperCase() + initialCallMode.slice(1)
          } Call`,
          headerShown: false,
        }}
      />

      <StreamCall call={callObject}>
        {/* Render custom UI based on call mode */}
        {initialCallMode === "audio" ? (
          <CustomAudioCallUI />
        ) : (
          <CustomVideoCallUI />
        )}
      </StreamCall>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },

  // Loading states
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1A202C",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#9CA3AF",
  },

  // Error states
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1A202C",
    padding: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#EF4444",
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },

  // Video call styles
  videoContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  videoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  videoContent: {
    flex: 1,
  },
  connectionBanner: {
    position: "absolute",
    top: 120,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 5,
  },
  connectionText: {
    color: "white",
    marginLeft: 8,
    fontSize: 14,
  },

  // Video layouts
  waitingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  localVideoLarge: {
    width: width * 0.85,
    height: height * 0.65,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1F2937",
  },
  waitingOverlay: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
  },
  waitingText: {
    color: "white",
    fontSize: 18,
    fontWeight: "500",
    textAlign: "center",
  },

  dualVideoContainer: {
    flex: 1,
  },
  mainVideo: {
    flex: 1,
    margin: 8,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1F2937",
  },
  mainVideoOverlay: {
    position: "absolute",
    bottom: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  participantLabel: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
    marginRight: 8,
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },

  pipVideo: {
    position: "absolute",
    top: 130,
    right: 16,
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "#1F2937",
  },
  pipLabel: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    color: "white",
    fontSize: 12,
    fontWeight: "500",
  },
  pipSpeakingDot: {
    position: "absolute",
    top: 8,
    right: 8,
  },

  participantVideoFull: {
    flex: 1,
  },

  // Audio call styles
  audioContainer: {
    flex: 1,
    backgroundColor: "#1A202C",
  },
  audioBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ripple: {
    position: "absolute",
    borderRadius: 300,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  ripple1: {
    width: 250,
    height: 250,
    top: "35%",
    left: "50%",
    marginLeft: -125,
    marginTop: -125,
  },
  ripple2: {
    width: 350,
    height: 350,
    top: "35%",
    left: "50%",
    marginLeft: -175,
    marginTop: -175,
  },
  ripple3: {
    width: 450,
    height: 450,
    top: "35%",
    left: "50%",
    marginLeft: -225,
    marginTop: -225,
  },

  audioHeader: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 20,
  },
  audioCallLabel: {
    fontSize: 16,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 8,
  },

  audioMainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },

  remoteParticipantSection: {
    alignItems: "center",
    marginBottom: 60,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 24,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
  },
  speakingRing: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: "#10B981",
    top: -10,
    left: -10,
  },
  remoteParticipantName: {
    fontSize: 26,
    fontWeight: "600",
    color: "white",
    textAlign: "center",
    marginBottom: 8,
  },
  participantRole: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 16,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },

  localParticipantSection: {
    alignItems: "center",
  },
  localParticipantLabel: {
    fontSize: 20,
    fontWeight: "500",
    color: "rgba(255,255,255,0.9)",
    marginBottom: 4,
  },
  localParticipantName: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
  },
  speakingIndicator: {
    fontSize: 12,
    color: "#10B981",
    fontWeight: "500",
    marginTop: 4,
  },

  // Controls container
  controlsContainer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    zIndex: 10,
  },
});

export default ConsultationPage;
