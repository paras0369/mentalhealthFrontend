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
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { API_URL } from "@/providers/AuthProvider"; // Assuming API_URL is exported from AuthProvider
import React from "react";
import { useChatContext } from "stream-chat-expo"; // Keep for chat button logic
import { useStreamVideoClient } from "@stream-io/video-react-native-sdk"; // Import hook for video client
import * as Crypto from "expo-crypto"; // Import expo-crypto for UUID generation

// Define an interface for the Therapist data received from backend
interface Therapist {
  id: string; // MongoDB ID (_id)
  name: string; // email for now
  streamId: string; // Stream ID for chat/call
  isAvailable: boolean;
  // Add other fields like specialties, photoUrl later
}

// Interface for the therapist's own user data (can be expanded)
interface TherapistSelfData {
  isAvailable: boolean;
  // Add earnings balance, etc. later
}

const Page = () => {
  // --- Hooks ---
  const { authState, isTherapist } = useAuth();
  const router = useRouter();
  const { client: chatClient } = useChatContext(); // Get Stream Chat client instance for chat button
  const videoClient = useStreamVideoClient(); // Get Stream Video client instance for call button

  // --- State Variables ---
  // State for client view (listing therapists)
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [isLoadingTherapists, setIsLoadingTherapists] = useState(false);
  const [therapistListError, setTherapistListError] = useState<string | null>(
    null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState<string | null>(null); // Track which chat button is loading
  const [isInitiatingCall, setIsInitiatingCall] = useState<string | null>(null); // Track which call button is loading

  // State for therapist view (dashboard)
  const [therapistStatus, setTherapistStatus] = useState<boolean>(false); // Therapist's own availability
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false); // Loading state for availability toggle
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(
    null
  ); // Error state for availability toggle

  // --- Callback Functions ---

  // Function to fetch the logged-in therapist's own status
  const fetchTherapistSelfStatus = useCallback(async () => {
    if (!authState.jwt) return; // Ensure JWT is available

    console.log("Fetching self status for therapist via /therapists/me");
    setStatusUpdateError(null); // Clear previous errors

    try {
      const response = await fetch(`${API_URL}/therapists/me`, {
        headers: {
          Authorization: `Bearer ${authState.jwt}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch (_) {} // Ignore parsing error
        throw new Error(errorMsg);
      }

      const selfData = await response.json();
      console.log("Fetched self status data:", selfData);

      if (typeof selfData.isAvailable === "boolean") {
        setTherapistStatus(selfData.isAvailable);
      } else {
        console.warn(
          "isAvailable field missing or not a boolean in /therapists/me response."
        );
        setTherapistStatus(false); // Fallback
      }
    } catch (err: any) {
      console.error("Error fetching self status:", err);
      setStatusUpdateError(
        err.message || "Could not load your current status."
      );
      setTherapistStatus(false); // Fallback on error
    }
  }, [authState.jwt]);

  // Function to fetch the list of available therapists (for Client View)
  const fetchAvailableTherapists = useCallback(async () => {
    if (isTherapist) return; // Don't fetch list if user is a therapist
    console.log("Fetching available therapists...");
    setIsLoadingTherapists(true);
    setTherapistListError(null);

    try {
      const response = await fetch(`${API_URL}/therapists/available`, {
        headers: {
          Authorization: `Bearer ${authState.jwt}`, // Use the JWT token
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} - ${
            response.statusText || "Failed to fetch"
          }`
        );
      }

      const data: Therapist[] = await response.json();
      console.log("Fetched therapists:", data);
      setTherapists(data);
    } catch (err: any) {
      console.error("Error fetching available therapists:", err);
      setTherapistListError(
        err.message || "Failed to load therapists. Please try again."
      );
      setTherapists([]); // Clear therapists on error
    } finally {
      setIsLoadingTherapists(false);
    }
  }, [authState.jwt, isTherapist]);

  // Function for Therapist to toggle their own availability
  const toggleAvailability = useCallback(
    async (newValue: boolean) => {
      if (!authState.jwt) return; // Need JWT
      console.log(`Toggling availability to: ${newValue}`);
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

        const responseData = await response.json(); // Read response body

        if (!response.ok) {
          throw new Error(
            responseData.message || `HTTP error! status: ${response.status}`
          );
        }

        console.log("Availability updated successfully via API:", responseData);
        setTherapistStatus(responseData.isAvailable); // Update state from successful API response
      } catch (err: any) {
        console.error("Error updating availability:", err);
        setStatusUpdateError(err.message || "Failed to update status.");
        // Revert UI optimistically if needed: setTherapistStatus(!newValue);
      } finally {
        setIsUpdatingStatus(false);
      }
    },
    [authState.jwt]
  );

  // Function for Client to initiate a Chat
  const handleChatPress = useCallback(
    async (therapist: Therapist) => {
      if (!chatClient || !authState.streamId) {
        Alert.alert(
          "Error",
          "Chat client not ready or user not authenticated."
        );
        return;
      }
      if (isCreatingChat || isInitiatingCall) return; // Prevent action if busy

      console.log(
        `Initiating chat with ${therapist.name} (Stream ID: ${therapist.streamId})`
      );
      setIsCreatingChat(therapist.id); // Set loading state for this specific therapist item

      try {
        const currentUserStreamId = authState.streamId;
        const therapistStreamId = therapist.streamId;
        const plainChannelId = [currentUserStreamId, therapistStreamId]
          .sort()
          .join("-");
        const channel = chatClient.channel("messaging", plainChannelId, {
          name: `Chat with ${therapist.name}`,
          members: [currentUserStreamId, therapistStreamId],
        });
        await channel.watch();
        console.log(`Channel watched/created: ${channel.cid}`);
        console.log(`Navigating to route: /chat/${plainChannelId}`);
        router.push(`/chat/${plainChannelId}`); // Navigate using plain ID
      } catch (error: any) {
        console.error("Error initiating chat:", error);
        Alert.alert("Error", `Could not start chat. ${error?.message || ""}`);
      } finally {
        setIsCreatingChat(null); // Clear loading state
      }
    },
    [chatClient, authState.streamId, router, isCreatingChat, isInitiatingCall]
  ); // Add all relevant dependencies

  // Function for Client to initiate a Call (using Stream Ringing)
  const handleCallPress = useCallback(
    async (therapist: Therapist) => {
      if (
        !videoClient ||
        !authState.streamId ||
        !authState.userId ||
        !authState.email
      ) {
        Alert.alert("Error", "Video client not ready or user details missing.");
        return;
      }
      if (isInitiatingCall || isCreatingChat) return; // Prevent action if busy

      console.log(
        `Initiating RINGING call with ${therapist.name} (ID: ${therapist.id}, Stream ID: ${therapist.streamId})`
      );
      setIsInitiatingCall(therapist.id);

      try {
        // TODO: Check Client Credits (API call needed)

        // Generate a unique Call ID (UUID)
        const callId = Crypto.randomUUID();
        console.log("Generated Call ID:", callId);

        // Get the Stream Video Call object instance
        const call = videoClient.call("default", callId);

        // Create the call on the server and start ringing members
        console.log(
          `Creating/Ringing call ${callId} for members: ${authState.streamId}, ${therapist.streamId}`
        );
        await call.getOrCreate({
          ring: true, // Enable ringing
          data: {
            members: [
              { user_id: authState.streamId }, // Caller
              { user_id: therapist.streamId }, // Callee
            ],
            custom: {
              // Store useful info
              caller_id: authState.streamId,
              caller_name: authState.email,
              therapist_id: therapist.streamId,
              therapist_mongo_id: therapist.id,
            },
          },
          // notify: false, // Keep false until push notifications are set up
        });
        console.log(`Call ${callId} created and ringing.`);

        // Navigate the client to the call screen
        console.log(`Navigating client to /consultation/${callId}`);
        router.push(`/consultation/${callId}`);
      } catch (error: any) {
        console.error("Error initiating call:", error);
        Alert.alert("Error", `Could not start call. ${error?.message || ""}`);
      } finally {
        setIsInitiatingCall(null); // Clear loading state
      }
    },
    [
      videoClient,
      authState.streamId,
      authState.userId,
      authState.email,
      router,
      isInitiatingCall,
      isCreatingChat,
    ]
  ); // Add dependencies

  // --- Effects ---
  // Fetch data when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (authState.jwt) {
        // Ensure user is logged in
        if (isTherapist) {
          // Fetch therapist's own status
          fetchTherapistSelfStatus();
        } else {
          // Fetch list of available therapists for clients
          fetchAvailableTherapists();
        }
      }
      // Optional cleanup function when screen goes out of focus
      return () => {
        console.log("Home screen blurred");
      };
    }, [
      authState.jwt,
      isTherapist,
      fetchAvailableTherapists,
      fetchTherapistSelfStatus,
    ]) // Dependencies
  );

  // --- Refresh Handler ---
  // Handles pull-to-refresh action
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isTherapist) {
      await fetchTherapistSelfStatus(); // Refresh self status
    } else {
      await fetchAvailableTherapists(); // Refresh list for client
    }
    setRefreshing(false);
  }, [isTherapist, fetchAvailableTherapists, fetchTherapistSelfStatus]);

  // --- Render Logic ---

  // Loading State (Client View - Initial Load)
  if (!isTherapist && isLoadingTherapists && therapists.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={styles.infoText}>Loading Therapists...</Text>
      </View>
    );
  }

  // Error State (Client View)
  if (!isTherapist && therapistListError) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {therapistListError}</Text>
        <TouchableOpacity
          onPress={fetchAvailableTherapists}
          style={styles.button}
        >
          <Text style={styles.buttonTextWhite}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main Content Rendering
  return (
    <View style={styles.container}>
      {/* === THERAPIST VIEW === */}
      {isTherapist ? (
        <View style={styles.therapistDashboard}>
          <Text style={styles.headerTitle}>My Dashboard</Text>

          {/* Availability Toggle Section */}
          <View style={styles.statusToggleContainer}>
            <Text style={styles.statusLabel}>My Status:</Text>
            <Switch
              trackColor={{ false: "#767577", true: "#81b0ff" }} // Standard iOS colors
              thumbColor={therapistStatus ? "#1E90FF" : "#f4f3f4"} // DodgerBlue when on
              ios_backgroundColor="#3e3e3e" // Dark background for track on iOS
              onValueChange={toggleAvailability}
              value={therapistStatus}
              disabled={isUpdatingStatus}
            />
            <Text
              style={[
                styles.statusText,
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
          {/* Display error message if status update failed */}
          {statusUpdateError && (
            <Text style={styles.errorTextSmall}>{statusUpdateError}</Text>
          )}

          {/* Placeholder for future features */}
          <View style={styles.placeholderSection}>
            <Text style={styles.infoText}>
              Earnings & Withdrawal features coming soon!
            </Text>
          </View>
        </View>
      ) : (
        // === CLIENT VIEW ===
        <FlatList
          data={therapists}
          keyExtractor={(item) => item.id} // Use MongoDB ID as key
          renderItem={({ item }) => (
            <View style={styles.therapistItem}>
              {/* Therapist Information */}
              <View style={styles.therapistInfo}>
                <Text style={styles.therapistName}>{item.name}</Text>
                <Text
                  style={[
                    styles.therapistStatus,
                    item.isAvailable
                      ? styles.statusAvailable
                      : styles.statusOffline,
                  ]}
                >
                  {item.isAvailable ? "Available" : "Offline"}
                </Text>
              </View>
              {/* Action Buttons */}
              <View style={styles.therapistActions}>
                {/* Chat Button */}
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.chatButton,
                    (!item.isAvailable || isInitiatingCall || isCreatingChat) &&
                      styles.disabledButton,
                  ]} // More precise disabling
                  onPress={() => handleChatPress(item)}
                  disabled={
                    !item.isAvailable || !!isCreatingChat || !!isInitiatingCall
                  }
                >
                  {isCreatingChat === item.id ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <MaterialIcons
                      name="chat-bubble-outline"
                      size={20}
                      color="white"
                    />
                  )}
                </TouchableOpacity>
                {/* Call Button */}
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.callButton,
                    (!item.isAvailable || isInitiatingCall || isCreatingChat) &&
                      styles.disabledButton,
                  ]} // More precise disabling
                  onPress={() => handleCallPress(item)}
                  disabled={
                    !item.isAvailable || !!isInitiatingCall || !!isCreatingChat
                  }
                >
                  {isInitiatingCall === item.id ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <MaterialIcons name="call" size={20} color="white" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
          // List Header
          ListHeaderComponent={() => (
            <Text style={styles.listHeader}>Available Therapists</Text>
          )}
          // Empty List Component
          ListEmptyComponent={() =>
            !isLoadingTherapists && ( // Render only when not loading initially
              <View style={styles.centerContainer}>
                <Text style={styles.infoText}>
                  No therapists are available right now.
                </Text>
              </View>
            )
          }
          // Pull-to-refresh Control
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#007BFF"
            />
          }
          contentContainerStyle={styles.listContentContainer}
        />
      )}
    </View>
  );
};

// --- STYLES --- (Consolidated and slightly refined)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    marginTop: 50, // Add some margin if it's rendered inside the list
  },
  // Therapist Dashboard Styles
  therapistDashboard: {
    padding: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 25,
    color: "#343A40",
  },
  statusToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#495057",
    marginRight: 15, // Increased spacing
  },
  statusText: {
    fontSize: 15,
    fontWeight: "600", // Semibold
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    overflow: "hidden",
  },
  statusAvailable: {
    color: "#28A745", // Green text for Available status
    // backgroundColor: '#e7f7e9', // Optional light green background
  },
  statusOffline: {
    color: "#6C757D", // Grey text for Offline status
    // backgroundColor: '#f1f3f5', // Optional light grey background
  },
  errorTextSmall: {
    fontSize: 13,
    color: "#DC3545",
    marginTop: -5,
    marginBottom: 15,
    marginLeft: 15,
  },
  placeholderSection: {
    marginTop: 30,
    padding: 20,
    backgroundColor: "#E9ECEF",
    borderRadius: 8,
    alignItems: "center",
  },
  // Client View List Styles
  listHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 20, // Added top margin
    marginBottom: 10,
    marginLeft: 15,
    color: "#343A40",
  },
  listContentContainer: {
    paddingBottom: 20,
  },
  therapistItem: {
    backgroundColor: "white",
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginVertical: 6, // Slightly increased vertical margin
    marginHorizontal: 12, // Slightly increased horizontal margin
    borderRadius: 10, // Slightly more rounded
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3, // Slightly increased shadow
  },
  therapistInfo: {
    flex: 1,
    marginRight: 10, // Add margin to prevent text touching buttons
  },
  therapistName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 3, // Space between name and status
  },
  therapistStatus: {
    fontSize: 13,
    // Colors handled inline using statusAvailable/statusOffline styles
  },
  therapistActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    marginLeft: 12, // Increased spacing between buttons
    borderRadius: 20, // Circular
    justifyContent: "center",
    alignItems: "center",
    width: 40,
    height: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1.5,
    elevation: 2,
  },
  chatButton: {
    backgroundColor: "#17A2B8", // Teal/Info
  },
  callButton: {
    backgroundColor: "#28A745", // Green
  },
  disabledButton: {
    backgroundColor: "#ADB5BD", // Greyed out
    elevation: 0, // Remove shadow when disabled
    opacity: 0.7, // Make it slightly transparent
  },
  // General Info/Error Styles
  infoText: {
    fontSize: 16,
    color: "#6C757D",
    textAlign: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#DC3545",
    textAlign: "center",
    marginBottom: 15,
  },
  button: {
    // General retry button style
    backgroundColor: "#007BFF",
    paddingVertical: 10,
    paddingHorizontal: 25, // Wider padding
    borderRadius: 5,
    marginTop: 15, // Increased margin
  },
  buttonTextWhite: {
    // Text for buttons with dark backgrounds
    color: "white",
    fontWeight: "bold", // Bolder text
    textAlign: "center",
  },
});

export default Page;
