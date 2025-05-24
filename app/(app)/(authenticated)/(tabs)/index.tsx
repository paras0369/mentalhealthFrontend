// Updated HomeScreen index.tsx - Remove ring, use custom notification
import React, { useState, useCallback } from "react";
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
  SafeAreaView,
  Image,
} from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth, API_URL } from "@/providers/AuthProvider";
import { useStreamVideoClient } from "@stream-io/video-react-native-sdk";
import * as Crypto from "expo-crypto";

// Define an interface for the Therapist data received from backend
interface Therapist {
  id: string;
  name: string;
  streamId: string;
  isAvailable: boolean;
  therapistRatePerMinute?: number;
}

// Interface for the therapist's own user data
interface TherapistSelfData {
  isAvailable: boolean;
  earningBalance?: number;
}

const HomeScreen = () => {
  const { authState, isTherapist } = useAuth();
  const router = useRouter();
  const videoClient = useStreamVideoClient();

  // --- State Variables ---
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isInitiatingCall, setIsInitiatingCall] = useState<string | null>(null);
  const [therapistStatus, setTherapistStatus] = useState<boolean>(false);

  // --- API Callbacks ---
  const fetchData = useCallback(async () => {
    if (!authState.jwt) return;

    console.log("[HomeScreen] fetchData: Fetching relevant data...");
    setIsLoading(true);
    setError(null);

    try {
      if (isTherapist) {
        const response = await fetch(`${API_URL}/users/me`, {
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
        const selfData: TherapistSelfData & { isAvailable: boolean } =
          await response.json();
        console.log(
          "[HomeScreen] fetchData: Fetched self status data:",
          selfData
        );
        setTherapistStatus(selfData.isAvailable);
      } else {
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
        console.log(
          "[HomeScreen] fetchData: Available therapists count:",
          data.length
        );
        setTherapists(data);
      }
    } catch (err: any) {
      console.error("[HomeScreen] fetchData: Error:", err);
      setError(err.message || "Could not load data.");
      if (!isTherapist) setTherapists([]);
      else setTherapistStatus(false);
    } finally {
      setIsLoading(false);
    }
  }, [authState.jwt, isTherapist, API_URL]);

  const toggleAvailability = useCallback(
    async (newValue: boolean) => {
      if (!authState.jwt || !isTherapist) return;
      console.log(`[HomeScreen] toggleAvailability: Setting to: ${newValue}`);
      setIsLoading(true);
      setError(null);
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
        setError(err.message || "Failed to update status.");
        setTherapistStatus((prev) => !prev);
      } finally {
        setIsLoading(false);
      }
    },
    [authState.jwt, isTherapist, API_URL]
  );

  const initiateCall = useCallback(
    async (therapist: Therapist, callMode: "audio" | "video") => {
      console.log(
        `[HomeScreen] initiateCall to ${therapist.name}, Mode: ${callMode}`
      );
      if (!videoClient || !authState.streamId || !authState.email) {
        Alert.alert("Error", "Video service or user details are missing.");
        return;
      }
      if (isInitiatingCall) return;

      const requiredCoins = therapist.therapistRatePerMinute || 5;
      if (!isTherapist && (authState.creditBalance ?? 0) < requiredCoins) {
        Alert.alert(
          "Low Balance",
          `You need at least ${requiredCoins} coins. Please buy more.`
        );
        return;
      }

      setIsInitiatingCall(therapist.id + callMode);
      const callId = Crypto.randomUUID();

      try {
        console.log(`[HomeScreen] Creating call ${callId} without ringing`);

        // Create the call instance first
        const call = videoClient.call("default", callId);

        // Configure call settings
        if (callMode === "audio") {
          await call.camera.disable();
          await call.microphone.enable();
        } else {
          await call.camera.enable();
          await call.microphone.enable();
        }

        // Create call WITHOUT ringing - no default Stream UI will show
        await call.getOrCreate({
          data: {
            members: [
              { user_id: authState.streamId! },
              { user_id: therapist.streamId },
            ],
            custom: {
              caller_id: authState.streamId!,
              caller_name: authState.email!,
              therapist_user_db_id: therapist.id,
              therapist_stream_id: therapist.streamId,
              intended_call_mode: callMode,
              therapist_name: therapist.name,
              call_rate: therapist.therapistRatePerMinute || 5,
            },
            settings_override: {
              video: {
                camera_default_on: callMode === "video",
                enabled: callMode === "video",
                target_resolution: { width: 720, height: 1280 },
              },
              audio: {
                mic_default_on: true,
                default_device: "speaker" as const,
              },
            },
          },
        });

        console.log(`[HomeScreen] Call ${callId} created successfully`);

        // Send custom notification to therapist via backend
        try {
          await fetch(`${API_URL}/calls/notify-therapist`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authState.jwt}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              therapistId: therapist.id,
              callId: callId,
              callMode: callMode,
              callerName: authState.email,
              callRate: therapist.therapistRatePerMinute || 5,
            }),
          });
          console.log(`[HomeScreen] Notification sent to therapist`);
        } catch (notificationError) {
          console.error(
            "[HomeScreen] Failed to send notification:",
            notificationError
          );
          // Don't fail the call creation if notification fails
        }

        // Navigate to custom call screen AFTER call is created and notification sent
        router.push({
          pathname: "/(app)/(authenticated)/consultation/[id]",
          params: {
            id: callId,
            initialCallMode: callMode,
            therapistId: therapist.id,
            therapistName: therapist.name,
            callRate: (therapist.therapistRatePerMinute || 5).toString(),
          },
        });
      } catch (error: any) {
        console.error(
          "[HomeScreen] initiateCall: Error:",
          error.message,
          error
        );
        Alert.alert(
          "Error Starting Call",
          error.message || "Could not initiate the call."
        );
      } finally {
        setIsInitiatingCall(null);
      }
    },
    [videoClient, authState, isInitiatingCall, isTherapist, router, API_URL]
  );

  useFocusEffect(
    useCallback(() => {
      console.log("[HomeScreen] useFocusEffect: Screen focused.");
      fetchData();
      return () => console.log("[HomeScreen] useFocusEffect: Screen blurred.");
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    console.log("[HomeScreen] onRefresh: Initiated.");
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // --- Render Helper for Empty/Error/Loading States ---
  const renderStatusView = (message: string, isError: boolean = false) => (
    <View className="flex-1 justify-center items-center p-5 bg-slate-50">
      <Ionicons
        name={isError ? "cloud-offline-outline" : "information-circle-outline"}
        size={48}
        color={isError ? "red" : "rgb(100 116 139)"}
      />
      <Text
        className={`text-lg text-center mt-4 ${
          isError ? "text-red-600" : "text-slate-600"
        }`}
      >
        {message}
      </Text>
      {isError && (
        <TouchableOpacity
          className="mt-6 bg-blue-600 py-3 px-6 rounded-lg shadow"
          onPress={fetchData}
        >
          <Text className="text-white font-semibold text-base">Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // --- Therapist View ---
  if (isTherapist) {
    return (
      <SafeAreaView className="flex-1 bg-slate-100">
        <View className="p-6">
          <Text className="text-3xl font-bold text-slate-800 mb-2">
            Dashboard
          </Text>
          <Text className="text-lg text-slate-600 mb-8">
            Manage your availability and view earnings.
          </Text>

          <View className="bg-white p-5 rounded-xl shadow-lg mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-xl font-semibold text-slate-700">
                My Availability
              </Text>
              <Switch
                trackColor={{ false: "#E5E7EB", true: "#60A5FA" }}
                thumbColor={therapistStatus ? "#2563EB" : "#F9FAFB"}
                ios_backgroundColor="#E5E7EB"
                onValueChange={toggleAvailability}
                value={therapistStatus}
                disabled={isLoading}
              />
            </View>
            <Text
              className={`text-base font-medium ${
                therapistStatus ? "text-green-600" : "text-slate-500"
              }`}
            >
              {isLoading
                ? "Updating..."
                : therapistStatus
                ? "You are currently AVAILABLE"
                : "You are currently OFFLINE"}
            </Text>
            {error && !isLoading && (
              <Text className="text-sm text-red-500 mt-2">{error}</Text>
            )}
          </View>

          <View className="bg-white p-5 rounded-xl shadow-lg">
            <Text className="text-xl font-semibold text-slate-700 mb-2">
              Earnings
            </Text>
            <Text className="text-3xl font-bold text-blue-600">
              {authState.earningBalance ?? 0}
              <Text className="text-xl text-slate-500"> coins</Text>
            </Text>
            <Text className="text-sm text-slate-500 mt-1">
              More earning details coming soon.
            </Text>
          </View>
          {isLoading && (
            <ActivityIndicator size="large" color="#2563EB" className="mt-8" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  // --- Client View ---
  if (isLoading && therapists.length === 0 && !refreshing) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-600 text-lg">
          Finding Therapists...
        </Text>
      </View>
    );
  }

  if (error && therapists.length === 0) {
    return renderStatusView(error, true);
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-100">
      <View className="px-4 pt-6 pb-2">
        <Text className="text-3xl font-bold text-slate-800">Find Support</Text>
        <Text className="text-base text-slate-600 mt-1">
          Connect with available therapists.
        </Text>
      </View>

      <FlatList
        data={therapists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="bg-white rounded-xl shadow-lg m-3 overflow-hidden">
            <View className="p-5">
              <View className="flex-1">
                <Text className="text-xl font-semibold text-slate-800 mb-1">
                  {item.name || "Therapist"}
                </Text>
                <View
                  className={`flex-row items-center mb-1 px-2 py-0.5 rounded-full self-start ${
                    item.isAvailable ? "bg-green-100" : "bg-slate-100"
                  }`}
                >
                  <View
                    className={`w-2.5 h-2.5 rounded-full mr-1.5 ${
                      item.isAvailable ? "bg-green-500" : "bg-slate-400"
                    }`}
                  />
                  <Text
                    className={`text-sm font-medium ${
                      item.isAvailable ? "text-green-700" : "text-slate-600"
                    }`}
                  >
                    {item.isAvailable ? "Available" : "Offline"}
                  </Text>
                </View>
                <Text className="text-sm text-slate-500">
                  Rate: {item.therapistRatePerMinute || 5} coins/min
                </Text>
              </View>
            </View>

            <View className="flex-row border-t border-slate-200">
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center border-r border-slate-200 ${
                  !item.isAvailable || !!isInitiatingCall
                    ? "bg-slate-50"
                    : "bg-blue-50 hover:bg-blue-100"
                }`}
                onPress={() => initiateCall(item, "audio")}
                disabled={!item.isAvailable || !!isInitiatingCall}
              >
                {isInitiatingCall === item.id + "audio" ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <View className="flex-row items-center">
                    <Ionicons
                      name="call-outline"
                      size={20}
                      color={
                        !item.isAvailable || !!isInitiatingCall
                          ? "#94A3B8"
                          : "#2563EB"
                      }
                    />
                    <Text
                      className={`ml-2 font-semibold ${
                        !item.isAvailable || !!isInitiatingCall
                          ? "text-slate-400"
                          : "text-blue-700"
                      }`}
                    >
                      Audio Call
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center ${
                  !item.isAvailable || !!isInitiatingCall
                    ? "bg-slate-50"
                    : "bg-green-50 hover:bg-green-100"
                }`}
                onPress={() => initiateCall(item, "video")}
                disabled={!item.isAvailable || !!isInitiatingCall}
              >
                {isInitiatingCall === item.id + "video" ? (
                  <ActivityIndicator size="small" color="#16A34A" />
                ) : (
                  <View className="flex-row items-center">
                    <Ionicons
                      name="videocam-outline"
                      size={20}
                      color={
                        !item.isAvailable || !!isInitiatingCall
                          ? "#94A3B8"
                          : "#16A34A"
                      }
                    />
                    <Text
                      className={`ml-2 font-semibold ${
                        !item.isAvailable || !!isInitiatingCall
                          ? "text-slate-400"
                          : "text-green-700"
                      }`}
                    >
                      Video Call
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={() =>
          !isLoading &&
          !error &&
          renderStatusView(
            "No therapists are available right now. Please check back later."
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563EB"
            colors={["#2563EB", "#1D4ED8"]}
          />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </SafeAreaView>
  );
};

export default HomeScreen;
