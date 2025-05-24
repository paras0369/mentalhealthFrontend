// app/(app)/(authenticated)/_layout.tsx
import { useAuth } from "@/providers/AuthProvider";
import { Stack, Redirect, useRouter } from "expo-router";
import React from "react";
import CallNotificationListener from "@/components/CallNotificationListener";

const AuthenticatedLayout = () => {
  const { authState } = useAuth();

  console.log(
    "AuthenticatedLayout Render - Authenticated:",
    authState?.authenticated
  );

  if (!authState.authenticated) {
    console.log(
      "AuthenticatedLayout: Not authenticated, redirecting to login..."
    );
    return <Redirect href="/login" />;
  }

  console.log("AuthenticatedLayout: Rendering authenticated stack");

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        <Stack.Screen
          name="consultation/[id]"
          options={{
            title: "Consultation Call",
            headerBackTitle: "Back",
          }}
        />
      </Stack>

      {/* Add CallNotificationListener to handle incoming calls */}
      <CallNotificationListener />
    </>
  );
};

export default AuthenticatedLayout;
