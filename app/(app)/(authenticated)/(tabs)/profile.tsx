// app/(app)/(authenticated)/(tabs)/profile.tsx
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useAuth, API_URL } from "@/providers/AuthProvider";
import React, { useState, useCallback } from "react"; // Import useState
import { useFocusEffect } from "expo-router"; // Import useFocusEffect

const Page = () => {
  const { signOut, authState, updateBalances } = useAuth();
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const fetchUserBalances = useCallback(async () => {
    if (!authState.jwt) return;

    console.log("[ProfileScreen] Fetching user balances...");
    setIsLoadingBalance(true);
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        // Use the new /users/me endpoint
        headers: {
          Authorization: `Bearer ${authState.jwt}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert(
          "Error",
          data.message || "Could not fetch updated balance."
        );
        throw new Error(data.message || "Failed to fetch user data");
      }

      console.log("[ProfileScreen] Fetched user data:", data);
      // Call updateBalances from AuthProvider
      // Ensure data.creditBalance and data.earningBalance exist and are numbers
      const balancesToUpdate: {
        creditBalance?: number;
        earningBalance?: number;
      } = {};
      if (typeof data.creditBalance === "number") {
        balancesToUpdate.creditBalance = data.creditBalance;
      }
      if (typeof data.earningBalance === "number") {
        balancesToUpdate.earningBalance = data.earningBalance;
      }

      if (Object.keys(balancesToUpdate).length > 0) {
        await updateBalances(balancesToUpdate);
      }
    } catch (error) {
      console.error("[ProfileScreen] Error fetching balances:", error);
      // Alert.alert("Error", "Could not update your balance information."); // Already handled if !response.ok
    } finally {
      setIsLoadingBalance(false);
    }
  }, [authState.jwt, updateBalances, API_URL]); // Add API_URL to dependencies

  // Use useFocusEffect to call fetchUserBalances when the screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchUserBalances();
      // Optional: return a cleanup function if needed, though not typical for fetch on focus
      return () => {
        console.log("[ProfileScreen] Screen blurred or unfocused.");
      };
    }, [fetchUserBalances])
  );

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <View className="flex-1 bg-white p-4 justify-start pt-10">
      <View className="items-center mb-8">
        <Text className="text-2xl font-bold mb-1">
          {authState.email || "User"}
        </Text>
        <Text className="text-gray-600 text-lg">
          Role: {authState.role || "N/A"}
        </Text>
      </View>

      <View className="bg-gray-100 p-4 rounded-lg mb-6">
        <Text className="text-lg font-semibold text-gray-700 mb-2">
          {authState.isTherapist ? "Earnings Balance" : "Coin Balance"}
        </Text>
        {isLoadingBalance ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <Text className="text-3xl font-bold text-blue-600">
            {authState.isTherapist
              ? authState.earningBalance ?? "0"
              : authState.creditBalance ?? "0"}
            <Text className="text-xl text-gray-500"> coins</Text>
          </Text>
        )}
      </View>

      {/* You can add a button to manually refresh balance too if needed */}
      {/* <Pressable className="bg-blue-500 p-3 rounded-lg mb-6" onPress={fetchUserBalances} disabled={isLoadingBalance}>
        <Text className="text-white text-center font-semibold">Refresh Balance</Text>
      </Pressable> */}

      <Pressable
        className="bg-red-500 p-4 rounded-lg mt-auto mb-5"
        onPress={handleSignOut}
      >
        <Text className="text-white text-center font-semibold">Sign Out</Text>
      </Pressable>
    </View>
  );
};

export default Page;
