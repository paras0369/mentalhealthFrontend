// components/CallDurationBadge.tsx
import React, { useEffect, useState, useMemo } from "react";
import { View, Text } from "react-native";
import { useCallStateHooks } from "@stream-io/video-react-native-sdk";
import { Ionicons } from "@expo/vector-icons"; // Or your preferred icon library

const formatTime = (totalSeconds: number) => {
  const flooredSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(flooredSeconds / 3600);
  const minutes = Math.floor((flooredSeconds % 3600) / 60);
  const seconds = flooredSeconds % 60;

  const paddedMinutes = minutes < 10 ? `0${minutes}` : minutes;
  const paddedSeconds = seconds < 10 ? `0${seconds}` : seconds;

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
};

interface CallDurationBadgeProps {
  textClassName?: string;
  iconColor?: string;
  iconSize?: number;
}

export const CallDurationBadge = ({
  textClassName = "text-sm text-slate-700 dark:text-slate-300",
  iconColor = "rgb(71 85 105)", // slate-600
  iconSize = 16,
}: CallDurationBadgeProps) => {
  const [elapsed, setElapsed] = useState<string>("00:00");
  const { useCallSession } = useCallStateHooks();
  const session = useCallSession();
  const startedAt = session?.started_at;

  const startedAtDateTimestamp = useMemo(() => {
    if (!startedAt) {
      return null; // Call hasn't officially started with a session_started event
    }
    const date = new Date(startedAt).getTime();
    return isNaN(date) ? null : date;
  }, [startedAt]);

  useEffect(() => {
    if (!startedAtDateTimestamp) {
      setElapsed("00:00"); // Reset if call hasn't started or session ended
      return;
    }

    const updateElapsedTime = () => {
      const now = Date.now();
      const initialElapsedSeconds = Math.max(
        0,
        (now - startedAtDateTimestamp) / 1000
      );
      setElapsed(formatTime(initialElapsedSeconds));
    };

    updateElapsedTime(); // Initial update

    const interval = setInterval(updateElapsedTime, 1000);
    return () => clearInterval(interval);
  }, [startedAtDateTimestamp]);

  if (!startedAt) {
    // Don't show timer if call hasn't really "started" via session
    return null;
  }

  return (
    <View className="flex-row items-center bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-full">
      <Ionicons name="timer-outline" size={iconSize} color={iconColor} />
      <Text className={`ml-1.5 font-medium ${textClassName}`}>{elapsed}</Text>
    </View>
  );
};
