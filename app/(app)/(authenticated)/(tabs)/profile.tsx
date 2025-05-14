// app/(app)/(authenticated)/(tabs)/profile.tsx
import { View, Text, Pressable } from "react-native";

import { useAuth } from "@/providers/AuthProvider";
import React, { useState, useEffect } from "react"; // Add imports for state/effect if fetching user data

const Page = () => {
  const { signOut, authState } = useAuth(); // Get authState for email/id

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <View className="flex-1 bg-white p-4 justify-center">
      <View className="items-center mb-8">
        <Text className="text-xl font-bold">{authState.email || "User"}</Text>
        <Text className="text-gray-500">Role: {authState.role || "N/A"}</Text>
      </View>

      <Pressable className="bg-red-500 p-4 rounded-lg" onPress={handleSignOut}>
        <Text className="text-white text-center font-semibold">Sign Out</Text>
      </Pressable>
    </View>
  );
};

export default Page;
