// app/(app)/(authenticated)/(tabs)/index.tsx
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Switch,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth, API_URL } from "@/providers/AuthProvider";
import { useStreamVideoClient } from "@stream-io/video-react-native-sdk";
import * as Crypto from "expo-crypto";

// Define an interface for the Therapist data received from backend
interface Therapist {
  id: string; // MongoDB ID (_id)
  name: string; // email for now, or actual name
  streamId: string; // Stream ID for call
  isAvailable: boolean;
}

// Interface for the therapist's own user data (can be expanded)
interface TherapistSelfData {
  isAvailable: boolean;
  // Add earnings balance, etc. later
}

const HomeScreen = () => {
  const { authState, isTherapist } = useAuth();
  const router = useRouter();
  const videoClient = useStreamVideoClient();

  // --- State Variables ---
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [isLoadingTherapists, setIsLoadingTherapists] = useState(false);
  const [therapistListError, setTherapistListError] = useState<string | null>(
    null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [isInitiatingCall, setIsInitiatingCall] = useState<string | null>(
    null // Stores therapist.id + callMode
  );

  const [therapistStatus, setTherapistStatus] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(
    null
  );

  // --- API Callbacks ---
  const fetchTherapistSelfStatus = useCallback(async () => {
    if (!authState.jwt || !isTherapist) return;
    console.log(
      "[HomeScreen] fetchTherapistSelfStatus: Fetching self status..."
    );
    setIsUpdatingStatus(true);
    setStatusUpdateError(null);
    try {
      const response = await fetch(`${API_URL}/therapists/me`, {
        headers: {
          Authorization: `Bearer ${authState.jwt}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      const selfData: TherapistSelfData & { email: string } = // Assuming email is still part of the response
        await response.json();
      console.log(
        "[HomeScreen] fetchTherapistSelfStatus: Fetched self status data:",
        selfData
      );
      if (typeof selfData.isAvailable === "boolean") {
        setTherapistStatus(selfData.isAvailable);
      } else {
        // Default to false if isAvailable is not a boolean or missing
        setTherapistStatus(false);
      }
    } catch (err: any) {
      console.error("[HomeScreen] fetchTherapistSelfStatus: Error:", err);
      setStatusUpdateError(
        err.message || "Could not load your current status."
      );
      setTherapistStatus(false); // Reset on error
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [authState.jwt, isTherapist]);

  const fetchAvailableTherapists = useCallback(async () => {
    if (isTherapist || !authState.jwt) return;
    console.log("[HomeScreen] fetchAvailableTherapists: Fetching...");
    setIsLoadingTherapists(true);
    setTherapistListError(null);
    try {
      const response = await fetch(`${API_URL}/therapists/available`, {
        headers: { Authorization: `Bearer ${authState.jwt}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      const data: Therapist[] = await response.json();
      console.log("[HomeScreen] fetchAvailableTherapists: Count:", data.length);
      setTherapists(data);
    } catch (err: any) {
      console.error("[HomeScreen] fetchAvailableTherapists: Error:", err);
      setTherapistListError(err.message || "Failed to load therapists.");
      setTherapists([]);
    } finally {
      setIsLoadingTherapists(false);
    }
  }, [authState.jwt, isTherapist]);

  const toggleAvailability = useCallback(
    async (newValue: boolean) => {
      if (!authState.jwt || !isTherapist) return;
      console.log(`[HomeScreen] toggleAvailability: Setting to: ${newValue}`);
      setIsUpdatingStatus(true);
      setStatusUpdateError(null);
      try {
        const response = await fetch(`${API_URL}/therapists/me/availability`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${authState.jwt}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isAvailable: newValue }),
        });
        const responseData = await response.json();
        if (!response.ok) {
          throw new Error(
            responseData.message || `HTTP error! status: ${response.status}`
          );
        }
        console.log("[HomeScreen] toggleAvailability: Success:", responseData);
        setTherapistStatus(responseData.isAvailable);
      } catch (err: any) {
        console.error("[HomeScreen] toggleAvailability: Error:", err);
        setStatusUpdateError(err.message || "Failed to update status.");
        // Revert UI on error
        setTherapistStatus((prev) => !prev);
      } finally {
        setIsUpdatingStatus(false);
      }
    },
    [authState.jwt, isTherapist]
  );

  // --- Call Initiation ---
  const initiateCall = useCallback(
    async (therapist: Therapist, callMode: "audio" | "video") => {
      console.log(
        `[HomeScreen] initiateCall to therapist StreamID: ${therapist.streamId}, Mode: ${callMode}`
      );
      if (!videoClient) {
        Alert.alert(
          "Error",
          "Video service is not available. Please try again later."
        );
        console.error(
          "[HomeScreen] initiateCall: videoClient is not available."
        );
        return;
      }
      if (!authState.streamId || !authState.email) {
        Alert.alert("Error", "User authentication details are missing.");
        console.error(
          "[HomeScreen] initiateCall: Missing authState.streamId or authState.email."
        );
        return;
      }
      if (isInitiatingCall) {
        console.log(
          "[HomeScreen] initiateCall: Another call initiation in progress."
        );
        return;
      }

      setIsInitiatingCall(therapist.id + callMode);

      const callId = Crypto.randomUUID();
      const streamCallType = "default"; // Ensure this type is configured in your Stream Dashboard

      try {
        // Get a call object from the client.
        const call = videoClient.call(streamCallType, callId);

        // Define the settings for the call being created.
        const callDataForRing = {
          ring: true, // This makes the call ring for members.
          data: {
            members: [
              { user_id: authState.streamId! }, // Caller must be a member
              { user_id: therapist.streamId },
            ],
            custom: {
              caller_id: authState.streamId!,
              caller_name: authState.email!,
              therapist_user_db_id: therapist.id, // Your backend DB ID
              therapist_stream_id: therapist.streamId,
              intended_call_mode: callMode,
            },
            settings_override: {
              video: {
                camera_default_on: callMode === "video",
                enabled: callMode === "video",
                target_resolution: { width: 640, height: 480 },
              },
              audio: {
                mic_default_on: true,
                default_device: "speaker" as const,
              },
            },
          },
        };

        console.log(
          `[HomeScreen] Calling call.getOrCreate() for ringing call ${callId} with data:`,
          JSON.stringify(callDataForRing.data, null, 2)
        );

        await call.getOrCreate(callDataForRing);

        console.log(`[HomeScreen] Ringing call ${callId} initiated.`);
        // The global `RingingCalls` component will handle the UI for ringing/incoming call.
      } catch (error: any) {
        console.error(
          "[HomeScreen] initiateCall: Error during call.getOrCreate():",
          error
        );
        const streamErrorDetails = error.data || error.response?.data;
        let alertMessage = "Could not initiate the call.";
        if (streamErrorDetails?.message)
          alertMessage = streamErrorDetails.message;
        else if (error.message) alertMessage = error.message;
        Alert.alert("Error Starting Call", alertMessage);
      } finally {
        setIsInitiatingCall(null);
      }
    },
    [videoClient, authState, isInitiatingCall, router]
  );

  // --- Effects ---
  useFocusEffect(
    useCallback(() => {
      console.log("[HomeScreen] useFocusEffect: Screen focused.");
      if (authState.jwt) {
        if (isTherapist) {
          fetchTherapistSelfStatus();
        } else {
          fetchAvailableTherapists();
        }
      }
      return () => {
        console.log("[HomeScreen] useFocusEffect: Screen blurred.");
        // Optional: any cleanup when screen blurs
      };
    }, [
      authState.jwt,
      isTherapist,
      fetchAvailableTherapists,
      fetchTherapistSelfStatus,
    ])
  );

  const onRefresh = useCallback(async () => {
    console.log("[HomeScreen] onRefresh: Initiated.");
    setRefreshing(true);
    if (isTherapist) {
      await fetchTherapistSelfStatus();
    } else {
      await fetchAvailableTherapists();
    }
    setRefreshing(false);
  }, [isTherapist, fetchAvailableTherapists, fetchTherapistSelfStatus]);

  // --- Render Logic ---
  // Therapist View
  if (isTherapist) {
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitle}>Therapist Dashboard</Text>
        <View style={styles.statusToggleContainer}>
          <Text style={styles.statusLabel}>My Availability:</Text>
          <Switch
            trackColor={{ false: "#767577", true: "#81b0ff" }}
            thumbColor={therapistStatus ? "#1E90FF" : "#f4f3f4"}
            ios_backgroundColor="#3e3e3e"
            onValueChange={toggleAvailability}
            value={therapistStatus}
            disabled={isUpdatingStatus}
          />
          <Text
            style={[
              styles.statusTextBase,
              therapistStatus ? styles.statusAvailable : styles.statusOffline,
            ]}
          >
            {isUpdatingStatus
              ? "Updating..."
              : therapistStatus
              ? "Available"
              : "Offline"}
          </Text>
        </View>
        {statusUpdateError && (
          <Text style={styles.errorTextSmall}>{statusUpdateError}</Text>
        )}
        {isUpdatingStatus && (
          <ActivityIndicator style={{ marginTop: 10 }} color="#007AFF" />
        )}
        <Text style={styles.placeholderText}>More features coming soon.</Text>
        <TouchableOpacity
          style={[
            styles.refreshButton,
            (refreshing || isUpdatingStatus) && styles.disabledButton,
          ]}
          onPress={onRefresh}
          disabled={refreshing || isUpdatingStatus}
        >
          <Text style={styles.refreshButtonText}>Refresh Status</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Client View
  if (isLoadingTherapists && therapists.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={styles.infoText}>Loading Therapists...</Text>
      </View>
    );
  }

  if (therapistListError) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {therapistListError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={fetchAvailableTherapists}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={therapists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.therapistItem}>
            <View style={styles.therapistInfo}>
              <Text style={styles.therapistName}>
                {item.name || "Therapist"}
              </Text>
              <Text
                style={[
                  styles.statusTextBase,
                  item.isAvailable
                    ? styles.statusAvailableCard
                    : styles.statusOfflineCard,
                ]}
              >
                {item.isAvailable ? "Available" : "Offline"}
              </Text>
            </View>
            <View style={styles.therapistActions}>
              <TouchableOpacity
                style={[
                  styles.actionButtonBase,
                  styles.videoCallButton,
                  (!item.isAvailable || !!isInitiatingCall) &&
                    styles.disabledButton,
                ]}
                onPress={() => initiateCall(item, "video")}
                disabled={!item.isAvailable || !!isInitiatingCall}
              >
                {isInitiatingCall === item.id + "video" ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <MaterialIcons name="videocam" size={20} color="white" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionButtonBase,
                  styles.audioCallButton,
                  (!item.isAvailable || !!isInitiatingCall) &&
                    styles.disabledButton,
                ]}
                onPress={() => initiateCall(item, "audio")}
                disabled={!item.isAvailable || !!isInitiatingCall}
              >
                {isInitiatingCall === item.id + "audio" ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <MaterialIcons name="call" size={20} color="white" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListHeaderComponent={() => (
          <Text style={styles.listHeader}>Available Therapists</Text>
        )}
        ListEmptyComponent={() =>
          !isLoadingTherapists && (
            <View style={styles.centerContainerEmptyList}>
              <Text style={styles.infoText}>
                No therapists available right now.
              </Text>
              <Text style={styles.infoTextSmall}>Pull down to refresh.</Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007BFF" // iOS
            colors={["#007AFF"]} // Android
          />
        }
        contentContainerStyle={styles.listContentContainer}
      />
    </View>
  );
};

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F2F5" },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  centerContainerEmptyList: {
    paddingTop: 50,
    alignItems: "center",
    padding: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginVertical: 20,
    textAlign: "center",
    color: "#333",
  },
  statusToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    backgroundColor: "white",
    borderRadius: 12,
    marginHorizontal: 15,
    marginBottom: 10,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statusLabel: {
    fontSize: 17,
    fontWeight: "500",
    marginRight: 10,
    color: "#4A4A4A",
  },
  statusTextBase: { fontSize: 14, fontWeight: "600" },
  statusAvailable: { color: "#28A745", marginLeft: "auto" },
  statusOffline: { color: "#6C757D", marginLeft: "auto" },
  statusAvailableCard: { color: "#28A745", fontSize: 13 },
  statusOfflineCard: { color: "#AEAEAE", fontSize: 13 },
  errorTextSmall: {
    fontSize: 13,
    color: "#D9534F",
    marginHorizontal: 15,
    marginTop: 5,
    marginBottom: 10,
    textAlign: "center",
  },
  infoText: { fontSize: 17, color: "#6C757D", textAlign: "center" },
  infoTextSmall: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginTop: 5,
  },
  errorText: {
    fontSize: 16,
    color: "#D9534F",
    textAlign: "center",
    marginBottom: 15,
  },
  placeholderText: {
    textAlign: "center",
    marginTop: 30,
    color: "gray",
    fontSize: 15,
  },
  retryButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    elevation: 2,
  },
  retryButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
  refreshButton: {
    backgroundColor: "#5BC0DE",
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    alignSelf: "center",
    marginTop: 20,
    elevation: 2,
  },
  refreshButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
  listHeader: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 15,
    marginBottom: 10,
    marginLeft: 15,
    color: "#343A40",
  },
  listContentContainer: { paddingBottom: 20 },
  therapistItem: {
    backgroundColor: "white",
    padding: 15,
    marginVertical: 6,
    marginHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  therapistInfo: { flex: 1, marginRight: 10 },
  therapistName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 4,
  },
  therapistActions: { flexDirection: "row", alignItems: "center" },
  actionButtonBase: {
    marginLeft: 10,
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1.5,
  },
  // chatButton: { backgroundColor: "#5BC0DE" }, // Style for the removed chat button
  videoCallButton: { backgroundColor: "#5CB85C" },
  audioCallButton: { backgroundColor: "#0275D8" },
  disabledButton: { backgroundColor: "#BDBDBD", opacity: 0.6, elevation: 0 },
});

export default HomeScreen;
