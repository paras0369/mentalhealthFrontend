// providers/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Key used for storing the auth data
const AUTH_DATA_KEY = "auth-data"; // Renamed for clarity

export const API_URL = Platform.select({
  ios: process.env.EXPO_PUBLIC_API_URL,
  android: "http://192.168.29.45:3000", // Make sure this is correct for your setup
  default: process.env.EXPO_PUBLIC_API_URL, // For web or other platforms
});

// --- Define a clear interface for the Auth State ---
interface AuthState {
  jwt: string | null; // JWT for your backend API
  streamToken: string | null; // Token for Stream Chat/Video
  authenticated: boolean; // Is the user logged in?
  userId: string | null; // MongoDB User._id
  streamId: string | null; // User ID used in Stream
  role: string | null; // User role ('client' or 'therapist')
  email: string | null; // User email
}

// --- Define the context type ---
interface AuthContextProps {
  authState: AuthState;
  onRegister: (email: string, password: string) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<any>;
  initialized: boolean;
  isTherapist: boolean;
}

// --- Initial empty state ---
const EMPTY_AUTH_STATE: AuthState = {
  jwt: null,
  streamToken: null,
  authenticated: false, // Default to false
  userId: null,
  streamId: null,
  role: null,
  email: null,
};

// --- Create Context ---
// Use Partial<AuthContextProps> only here, assert type in useAuth hook
const AuthContext = createContext<Partial<AuthContextProps>>({});

// --- Storage Helper (remains the same) ---
const storage = {
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.error("Local storage error:", e);
      }
      return;
    }
    return await SecureStore.setItemAsync(key, value);
  },
  async getItem(key: string) {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return;
    }
    return await SecureStore.deleteItemAsync(key);
  },
};

// --- AuthProvider Component ---
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authState, setAuthState] = useState<AuthState>(EMPTY_AUTH_STATE);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const loadAuthData = async () => {
      console.log("Attempting to load auth data...");
      const dataString = await storage.getItem(AUTH_DATA_KEY);
      console.log("Retrieved data string:", dataString);

      if (dataString) {
        try {
          const storedAuthState: AuthState = JSON.parse(dataString);
          // Basic validation: check if essential fields exist
          if (
            storedAuthState.jwt &&
            storedAuthState.streamToken &&
            storedAuthState.userId &&
            storedAuthState.streamId
          ) {
            console.log("Stored auth data seems valid, setting state.");
            setAuthState({ ...storedAuthState, authenticated: true }); // Ensure authenticated is true if data exists
          } else {
            console.log("Stored auth data is invalid or incomplete.");
            // Optionally clear invalid data
            await storage.removeItem(AUTH_DATA_KEY);
          }
        } catch (e) {
          console.error("Failed to parse stored auth data:", e);
          await storage.removeItem(AUTH_DATA_KEY); // Clear corrupted data
        }
      } else {
        console.log("No auth data found in storage.");
      }
      setInitialized(true);
    };
    loadAuthData();
  }, []);

  // --- Helper to update state and store data ---
  const setAndStoreAuthState = async (newAuthState: AuthState) => {
    setAuthState(newAuthState);
    // Only store if authenticated, otherwise remove data
    if (newAuthState.authenticated && newAuthState.jwt) {
      console.log("Storing auth data:", newAuthState);
      await storage.setItem(AUTH_DATA_KEY, JSON.stringify(newAuthState));
    } else {
      console.log("Removing auth data from storage.");
      await storage.removeItem(AUTH_DATA_KEY);
    }
  };

  // --- Authentication Functions ---
  const signIn = async (email: string, password: string) => {
    console.log(`Attempting sign in for: ${email}`);
    try {
      const result = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = await result.json();
      console.log("Login API Response:", json);

      if (!result.ok) {
        console.error("Login failed:", json.message || "Unknown error");
        throw new Error(json.message || "Login failed");
      }

      // --- Correctly parse the NEW response structure ---
      if (
        json.jwt &&
        json.token &&
        json.user &&
        json.user.id &&
        json.user.streamId
      ) {
        const newAuthState: AuthState = {
          jwt: json.jwt,
          streamToken: json.token, // Renamed from 'token' to avoid clash
          authenticated: true,
          userId: json.user.id, // MongoDB _id
          streamId: json.user.streamId, // Stream's User ID
          role: json.user.role,
          email: json.user.email,
        };
        await setAndStoreAuthState(newAuthState);
        console.log("Sign in successful, auth state updated.");
        return json; // Return the original JSON if needed elsewhere
      } else {
        console.error("Login response missing required fields.");
        throw new Error("Login response format incorrect.");
      }
    } catch (e: any) {
      console.error("Error during sign in:", e);
      // Ensure state is cleared on error
      await setAndStoreAuthState(EMPTY_AUTH_STATE);
      throw e; // Re-throw error so UI can catch it
    }
  };

  const register = async (email: string, password: string) => {
    console.log(`Attempting registration for: ${email}`);
    try {
      const result = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = await result.json();
      console.log("Register API Response:", json);

      if (!result.ok) {
        console.error("Registration failed:", json.message || "Unknown error");
        throw new Error(json.message || "Registration failed");
      }

      // --- Correctly parse the NEW response structure ---
      if (
        json.jwt &&
        json.token &&
        json.user &&
        json.user.id &&
        json.user.streamId
      ) {
        const newAuthState: AuthState = {
          jwt: json.jwt,
          streamToken: json.token,
          authenticated: true,
          userId: json.user.id,
          streamId: json.user.streamId,
          role: json.user.role,
          email: json.user.email,
        };
        await setAndStoreAuthState(newAuthState);
        console.log("Registration successful, auth state updated.");
        return json;
      } else {
        console.error("Registration response missing required fields.");
        throw new Error("Registration response format incorrect.");
      }
    } catch (e: any) {
      console.error("Error during registration:", e);
      // Ensure state is cleared on error
      await setAndStoreAuthState(EMPTY_AUTH_STATE);
      throw e; // Re-throw error so UI can catch it
    }
  };

  const signOut = async () => {
    console.log("Signing out.");
    // Optional: Call backend logout endpoint if it exists (e.g., to invalidate JWT server-side)
    await setAndStoreAuthState(EMPTY_AUTH_STATE); // Clear state and storage
  };

  const isTherapist = authState.role === "therapist";

  const value: AuthContextProps = {
    authState,
    onRegister: register,
    signIn,
    signOut,
    initialized,
    isTherapist,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the AuthContext
export const useAuth = (): AuthContextProps => {
  // Assert context type here for better intellisense and type safety
  const context = useContext(AuthContext);
  if (context === undefined || Object.keys(context).length === 0) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context as AuthContextProps;
};
