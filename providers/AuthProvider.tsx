// providers/AuthProvider.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Key used for storing the auth data
const AUTH_DATA_KEY = "auth-data";

export const API_URL = Platform.select({
  ios: process.env.EXPO_PUBLIC_API_URL,
  android: process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000", // 10.0.2.2 for Android emulator to host machine
  default: process.env.EXPO_PUBLIC_API_URL,
});

// --- Define a clear interface for the Auth State ---
interface AuthState {
  jwt: string | null;
  streamToken: string | null;
  authenticated: boolean;
  userId: string | null;
  streamId: string | null;
  role: string | null;
  email: string | null;
  creditBalance: number | null;
  earningBalance: number | null;
  isTherapist: boolean | null;
}

// --- Define the context type ---
interface AuthContextProps {
  authState: AuthState;
  onRegister: (email: string, password: string) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  updateBalances: (balances: {
    creditBalance?: number;
    earningBalance?: number;
  }) => Promise<void>;
  initialized: boolean;
  isTherapist: boolean;
}

// --- Initial empty state ---
const EMPTY_AUTH_STATE: AuthState = {
  jwt: null,
  streamToken: null,
  authenticated: false,
  userId: null,
  streamId: null,
  role: null,
  email: null,
  creditBalance: null,
  earningBalance: null,
  isTherapist: null,
};

// --- Create Context ---
const AuthContext = createContext<Partial<AuthContextProps>>({});

// --- Storage Helper ---
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

  // Effect to load auth data on initialization
  useEffect(() => {
    const loadAuthData = async () => {
      console.log("[AuthProvider] Attempting to load auth data...");
      const dataString = await storage.getItem(AUTH_DATA_KEY);
      console.log("[AuthProvider] Retrieved data string:", dataString);

      if (dataString) {
        try {
          const storedAuthState: AuthState = JSON.parse(dataString);
          if (
            storedAuthState.jwt &&
            storedAuthState.streamToken &&
            storedAuthState.userId &&
            storedAuthState.streamId
          ) {
            console.log(
              "[AuthProvider] Stored auth data seems valid, setting state."
            );
            setAuthState({ ...storedAuthState, authenticated: true });
          } else {
            console.log(
              "[AuthProvider] Stored auth data is invalid or incomplete. Clearing."
            );
            await storage.removeItem(AUTH_DATA_KEY);
          }
        } catch (e) {
          console.error("[AuthProvider] Failed to parse stored auth data:", e);
          await storage.removeItem(AUTH_DATA_KEY);
        }
      } else {
        console.log("[AuthProvider] No auth data found in storage.");
      }
      setInitialized(true);
    };
    loadAuthData();
  }, []);

  // Helper to persist auth state when it changes
  const persistAuthState = useCallback(async (stateToPersist: AuthState) => {
    if (stateToPersist.authenticated && stateToPersist.jwt) {
      console.log("[AuthProvider] Storing auth data:", stateToPersist);
      await storage.setItem(AUTH_DATA_KEY, JSON.stringify(stateToPersist));
    } else {
      console.log("[AuthProvider] Removing auth data from storage.");
      await storage.removeItem(AUTH_DATA_KEY);
    }
  }, []);

  // --- Authentication Functions ---
  const signIn = useCallback(
    async (email: string, password: string) => {
      console.log(`[AuthProvider] Attempting sign in for: ${email}`);
      try {
        const result = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const json = await result.json();
        console.log("[AuthProvider] Login API Response:", json);

        if (!result.ok) {
          throw new Error(json.message || "Login failed");
        }

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
            creditBalance: json.user.creditBalance ?? null, // Ensure null if undefined
            earningBalance: json.user.earningBalance ?? null,
            isTherapist: json.user.isTherapist ?? null,
          };
          setAuthState(newAuthState); // Set the new state
          await persistAuthState(newAuthState); // Persist it
          console.log("[AuthProvider] Sign in successful, auth state updated.");
          return json;
        } else {
          throw new Error("Login response format incorrect.");
        }
      } catch (e: any) {
        console.error("[AuthProvider] Error during sign in:", e);
        setAuthState(EMPTY_AUTH_STATE); // Reset state on error
        await persistAuthState(EMPTY_AUTH_STATE);
        throw e;
      }
    },
    [persistAuthState]
  );

  const onRegister = useCallback(
    async (email: string, password: string) => {
      console.log(`[AuthProvider] Attempting registration for: ${email}`);
      try {
        const result = await fetch(`${API_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const json = await result.json();
        console.log("[AuthProvider] Register API Response:", json);

        if (!result.ok) {
          throw new Error(json.message || "Registration failed");
        }

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
            creditBalance: json.user.creditBalance ?? null,
            earningBalance: json.user.earningBalance ?? null,
            isTherapist: json.user.isTherapist ?? null,
          };
          setAuthState(newAuthState);
          await persistAuthState(newAuthState);
          console.log(
            "[AuthProvider] Registration successful, auth state updated."
          );
          return json;
        } else {
          throw new Error("Registration response format incorrect.");
        }
      } catch (e: any) {
        console.error("[AuthProvider] Error during registration:", e);
        setAuthState(EMPTY_AUTH_STATE);
        await persistAuthState(EMPTY_AUTH_STATE);
        throw e;
      }
    },
    [persistAuthState]
  );

  const signOut = useCallback(async () => {
    console.log("[AuthProvider] Signing out.");
    setAuthState(EMPTY_AUTH_STATE);
    await persistAuthState(EMPTY_AUTH_STATE);
  }, [persistAuthState]);

  const updateBalances = useCallback(
    async (balances: { creditBalance?: number; earningBalance?: number }) => {
      if (!authState.authenticated) {
        console.warn(
          "[AuthProvider] updateBalances called while not authenticated."
        );
        return;
      }

      let needsStateUpdate = false;
      const updatedPartialState: Partial<AuthState> = {};

      if (
        typeof balances.creditBalance === "number" &&
        authState.creditBalance !== balances.creditBalance
      ) {
        updatedPartialState.creditBalance = balances.creditBalance;
        needsStateUpdate = true;
      }
      if (
        typeof balances.earningBalance === "number" &&
        authState.earningBalance !== balances.earningBalance
      ) {
        updatedPartialState.earningBalance = balances.earningBalance;
        needsStateUpdate = true;
      }

      if (needsStateUpdate) {
        console.log(
          "[AuthProvider] Balances differ, updating authState with:",
          updatedPartialState
        );
        const newState = { ...authState, ...updatedPartialState };
        setAuthState(newState);
        await persistAuthState(newState);
      } else {
        console.log(
          "[AuthProvider] Fetched balances are same as current. No state update."
        );
      }
    },
    [authState, persistAuthState]
  );

  const isTherapist = authState.role === "therapist";

  const value: AuthContextProps = {
    authState,
    onRegister,
    signIn,
    signOut,
    updateBalances,
    initialized,
    isTherapist,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the AuthContext
export const useAuth = (): AuthContextProps => {
  const context = useContext(AuthContext);
  if (context === undefined || Object.keys(context).length === 0) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context as AuthContextProps;
};
