// app/(app)/(authenticated)/(tabs)/history.tsx
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth, API_URL } from "@/providers/AuthProvider";
import { Ionicons } from "@expo/vector-icons";

interface CallHistoryEntry {
  id: string;
  otherPartyName: string;
  otherPartyRole: string;
  startTime?: string; // ISO Date string
  durationMinutes?: number;
  status: string;
  coinsDebited?: number;
  coinsEarned?: number;
  createdAt: string; // ISO Date string
  callType: "audio" | "video" | "Unknown"; // As defined in backend
}

const CallHistoryScreen = () => {
  const { authState, isTherapist } = useAuth();
  const [history, setHistory] = useState<CallHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!authState.jwt) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/calls/history`, {
        headers: {
          Authorization: `Bearer ${authState.jwt}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch call history");
      }
      setHistory(data);
    } catch (err: any) {
      setError(err.message);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [authState.jwt, API_URL]);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "Invalid Date";
    }
  };

  const renderCallItem = ({ item }: { item: CallHistoryEntry }) => {
    const iconName = item.callType === "audio" ? "call" : "videocam";
    const iconColor =
      item.status === "completed"
        ? "text-green-600"
        : item.status === "failed"
        ? "text-red-600"
        : "text-slate-500";

    return (
      <View className="bg-white shadow-md rounded-lg p-4 mx-4 my-2">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center">
            <Ionicons
              name={iconName}
              size={20}
              className={`${iconColor} mr-2`}
            />
            <Text className="text-lg font-semibold text-slate-800">
              {isTherapist ? "Call with Client" : "Call with Therapist"}
            </Text>
          </View>
          <Text
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              item.status === "completed"
                ? "bg-green-100 text-green-700"
                : item.status === "failed"
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>

        <Text className="text-base text-slate-700 mb-1">
          {isTherapist ? "Client: " : "Therapist: "}
          <Text className="font-medium">{item.otherPartyName}</Text>
        </Text>
        <Text className="text-sm text-slate-500 mb-1">
          Time: {formatDate(item.startTime)}
        </Text>
        <Text className="text-sm text-slate-500">
          Duration:{" "}
          {item.durationMinutes !== undefined
            ? `${item.durationMinutes} min`
            : "N/A"}
        </Text>

        {isTherapist && item.coinsEarned !== undefined && (
          <Text className="text-sm text-green-600 mt-1">
            + {item.coinsEarned} coins earned
          </Text>
        )}
        {!isTherapist && item.coinsDebited !== undefined && (
          <Text className="text-sm text-red-600 mt-1">
            - {item.coinsDebited} coins spent
          </Text>
        )}
        <Text className="text-xs text-slate-400 mt-2 text-right">
          Logged: {formatDate(item.createdAt)}
        </Text>
      </View>
    );
  };

  if (loading && history.length === 0 && !refreshing) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-2 text-slate-600">Loading Call History...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 justify-center items-center p-5 bg-slate-50">
        <Ionicons
          name="cloud-offline-outline"
          size={48}
          color="rgb(239 68 68)"
        />
        <Text className="text-lg text-red-600 mt-4 text-center">{error}</Text>
        <TouchableOpacity
          className="mt-6 bg-blue-600 py-2 px-5 rounded-md"
          onPress={fetchHistory}
        >
          <Text className="text-white font-semibold">Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-100">
      {history.length === 0 && !loading ? (
        <View className="flex-1 justify-center items-center p-5">
          <Ionicons
            name="document-text-outline"
            size={48}
            color="rgb(100 116 139)"
          />
          <Text className="text-lg text-slate-600 mt-4 text-center">
            No call history found.
          </Text>
          <Text className="text-sm text-slate-500 mt-1 text-center">
            Completed calls will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderCallItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#2563EB"
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

export default CallHistoryScreen;
