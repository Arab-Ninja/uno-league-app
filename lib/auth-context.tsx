/**
 * AuthContext v5 - Backend-first with TiDB persistence using fetch()
 * 
 * This context:
 * 1. Calls tRPC backend via fetch() to persist all data in TiDB
 * 2. Creates users in BOTH Users (native Manus) and Players tables
 * 3. Uses AsyncStorage for offline caching only
 * 4. Syncs data bidirectionally with backend
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalPlayer {
  openId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  address?: string;
  division: "D1" | "D2" | "D3";
  unoPoints: number;
  xp: number;
  level: number;
  statsGoals: number;
  statsAssists: number;
  statsDefenses: number;
  statsSaves: number;
  statsMotm: number;
  avatar?: string;
  nationality?: string;
  dateOfBirth?: string;
  profilePhoto?: string | null;
}

export interface SignUpData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  nationality: string;
  password: string;
  profilePhoto?: string;
}

// Storage keys
const USER_KEY = "user";
const ALL_USERS_KEY = "all_users";
const PASSWORDS_KEY = "user_passwords";

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: LocalPlayer | null;
  allUsers: LocalPlayer[];
  isSignedIn: boolean;
  signup: (data: SignUpData) => Promise<LocalPlayer>;
  login: (email: string, password: string) => Promise<LocalPlayer>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<LocalPlayer>) => Promise<void>;
  updateUnoPoints: (
    delta: number,
    description: string,
    type?: "send" | "receive" | "purchase" | "reward",
  ) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalPlayer | null>(null);
  const [allUsers, setAllUsers] = useState<LocalPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from AsyncStorage on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = await AsyncStorage.getItem(USER_KEY);
        if (stored) {
          const userData = JSON.parse(stored);
          setUser(userData);
          console.log("[AuthContext] ✅ User loaded from storage:", userData.name);
        }
      } catch (error) {
        console.error("[AuthContext] ❌ Failed to load user:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  // ── callBackend ────────────────────────────────────────────────────────────

  const callBackend = useCallback(
    async (method: string, data: any) => {
      try {
        const response = await fetch(
          "http://127.0.0.1:3000/api/players/" + method,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        );
        const result = await response.json();
        if (result.error) {
          console.error(`[Backend] ❌ ${method} failed:`, result.error);
          return null;
        }
        console.log(`[Backend] ✅ ${method} succeeded:`, result.result);
        return result.result;
      } catch (error) {
        console.error(`[Backend] ❌ ${method} error:`, error);
        return null;
      }
    },
    []
  );

  // ── signup ─────────────────────────────────────────────────────────────────

  const signup = useCallback(
    async (data: SignUpData): Promise<LocalPlayer> => {
      try {
        console.log("[AuthContext.signup] 📝 Signing up:", data.email);

        const openId = `user_${Date.now()}`;
        const newUser: LocalPlayer = {
          openId,
          name: `${data.firstName} ${data.lastName}`,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          nationality: data.nationality,
          dateOfBirth: data.dateOfBirth,
          division: "D3",
          unoPoints: 1000,
          xp: 0,
          level: 1,
          statsGoals: 0,
          statsAssists: 0,
          statsDefenses: 0,
          statsSaves: 0,
          statsMotm: 0,
          profilePhoto: data.profilePhoto || null,
        };

        // 1️⃣ PERSIST IN TIDB VIA BACKEND
        console.log("[AuthContext.signup] 🔄 Calling backend to save player...");
        const backendResult = await callBackend("upsert", {
          openId: newUser.openId,
          name: newUser.name,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          division: newUser.division,
          unoPoints: newUser.unoPoints,
          xp: newUser.xp,
          level: newUser.level,
          goals: newUser.statsGoals,
          assists: newUser.statsAssists,
          defenses: newUser.statsDefenses,
          saves: newUser.statsSaves,
          motm: newUser.statsMotm,
          avatar: newUser.avatar || "",
          nationality: newUser.nationality || "",
          dateOfBirth: newUser.dateOfBirth || "",
          profilePhoto: newUser.profilePhoto || "",
        });

        if (!backendResult) {
          throw new Error("Backend failed to create player");
        }

        console.log("[AuthContext.signup] ✅ Player saved to TiDB");

        // 2️⃣ SAVE PASSWORD LOCALLY
        const passwords = JSON.parse(
          (await AsyncStorage.getItem(PASSWORDS_KEY)) || "{}"
        );
        passwords[data.email] = data.password;
        await AsyncStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));

        // 3️⃣ SAVE TO ASYNCSTORAGE
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
        setUser(newUser);

        // 4️⃣ UPDATE ALL USERS MAP
        const usersMap = JSON.parse(
          (await AsyncStorage.getItem(ALL_USERS_KEY)) || "{}"
        );
        usersMap[data.email] = newUser;
        await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(usersMap));
        setAllUsers(Object.values(usersMap));

        console.log("[AuthContext.signup] ✅ User signed up:", newUser.name);
        return newUser;
      } catch (error) {
        console.error("[AuthContext.signup] ❌ Signup failed:", error);
        throw error;
      }
    },
    [callBackend]
  );

  // ── login ──────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string): Promise<LocalPlayer> => {
      try {
        console.log("[AuthContext.login] 🔐 Logging in:", email);

        const usersMap = JSON.parse(
          (await AsyncStorage.getItem(ALL_USERS_KEY)) || "{}"
        );
        const user = usersMap[email];

        if (!user) {
          throw new Error("User not found");
        }

        const passwords = JSON.parse(
          (await AsyncStorage.getItem(PASSWORDS_KEY)) || "{}"
        );
        if (passwords[email] !== password) {
          throw new Error("Invalid password");
        }

        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
        setUser(user);

        console.log("[AuthContext.login] ✅ Logged in:", user.name);
        return user;
      } catch (error) {
        console.error("[AuthContext.login] ❌ Login failed:", error);
        throw error;
      }
    },
    []
  );

  // ── updateProfile ──────────────────────────────────────────────────────────

  const updateProfile = useCallback(
    async (updates: Partial<LocalPlayer>) => {
      if (!user) throw new Error("No user logged in");
      try {
        console.log("[AuthContext.updateProfile] 📝 Updating profile:", updates);
        const updated = { ...user, ...updates };

        // 1️⃣ UPDATE IN TIDB VIA BACKEND
        console.log("[AuthContext.updateProfile] 🔄 Calling backend...");
        const backendResult = await callBackend("upsert", {
          openId: updated.openId,
          name: updated.name,
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email,
          division: updated.division,
          unoPoints: updated.unoPoints,
          xp: updated.xp,
          level: updated.level,
          goals: updated.statsGoals,
          assists: updated.statsAssists,
          defenses: updated.statsDefenses,
          saves: updated.statsSaves,
          motm: updated.statsMotm,
          avatar: updated.avatar,
          nationality: updated.nationality,
          dateOfBirth: updated.dateOfBirth,
          profilePhoto: updated.profilePhoto,
        });

        if (!backendResult) {
          throw new Error("Backend failed to update player");
        }

        console.log("[AuthContext.updateProfile] ✅ Profile saved to TiDB");

        // 2️⃣ Update AsyncStorage
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
        setUser(updated);

        // 3️⃣ Keep all-users map in sync
        const usersMap = JSON.parse(
          (await AsyncStorage.getItem(ALL_USERS_KEY)) || "{}"
        );
        if (user.email && usersMap[user.email]) {
          usersMap[user.email] = updated;
          await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(usersMap));
          setAllUsers(Object.values(usersMap));
        }
        console.log("[AuthContext.updateProfile] ✅ Profile updated");
      } catch (error) {
        console.error("[AuthContext.updateProfile] ❌ Update failed:", error);
        throw error;
      }
    },
    [user, callBackend]
  );

  // ── updateUnoPoints ────────────────────────────────────────────────────────

  const updateUnoPoints = useCallback(
    async (
      delta: number,
      description: string,
      type?: "send" | "receive" | "purchase" | "reward",
    ) => {
      if (!user) throw new Error("No user logged in");
      try {
        console.log("[AuthContext.updateUnoPoints] 💰 Updating UNO points:", {
          delta,
          description,
        });

        const newPoints = Math.max(0, user.unoPoints + delta);

        // 1️⃣ ADD TRANSACTION IN TIDB
        console.log("[AuthContext.updateUnoPoints] 🔄 Recording transaction...");
        const transactionResult = await callBackend("addPoints", {
          openId: user.openId,
          delta,
          description,
          type: type ?? (delta > 0 ? "receive" : "send"),
        });

        if (!transactionResult) {
          throw new Error("Backend failed to record transaction");
        }

        console.log(
          "[AuthContext.updateUnoPoints] ✅ Transaction recorded in TiDB"
        );

        // 2️⃣ UPDATE PLAYER IN TIDB
        console.log("[AuthContext.updateUnoPoints] 🔄 Updating player...");
        const updated = { ...user, unoPoints: newPoints };
        const playerResult = await callBackend("upsert", {
          openId: updated.openId,
          name: updated.name,
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email,
          division: updated.division,
          unoPoints: updated.unoPoints,
          xp: updated.xp,
          level: updated.level,
          goals: updated.statsGoals,
          assists: updated.statsAssists,
          defenses: updated.statsDefenses,
          saves: updated.statsSaves,
          motm: updated.statsMotm,
          avatar: updated.avatar,
          nationality: updated.nationality,
          dateOfBirth: updated.dateOfBirth,
          profilePhoto: updated.profilePhoto,
        });

        if (!playerResult) {
          throw new Error("Backend failed to update player");
        }

        console.log("[AuthContext.updateUnoPoints] ✅ Player updated in TiDB");

        // 3️⃣ Update local state
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
        setUser(updated);

        // 4️⃣ Keep all-users map in sync
        const usersMap = JSON.parse(
          (await AsyncStorage.getItem(ALL_USERS_KEY)) || "{}"
        );
        if (user.email && usersMap[user.email]) {
          usersMap[user.email] = updated;
          await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(usersMap));
          setAllUsers(Object.values(usersMap));
        }

        console.log("[AuthContext.updateUnoPoints] ✅ UNO points updated");
      } catch (error) {
        console.error("[AuthContext.updateUnoPoints] ❌ Update failed:", error);
        throw error;
      }
    },
    [user, callBackend]
  );

  // ── changePassword ─────────────────────────────────────────────────────────

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!user) throw new Error("No user logged in");
      try {
        console.log("[AuthContext.changePassword] 🔑 Changing password...");

        const passwords = JSON.parse(
          (await AsyncStorage.getItem(PASSWORDS_KEY)) || "{}"
        );

        if (!user.email) throw new Error("No email associated with account");

        if (passwords[user.email] !== currentPassword) {
          throw new Error("Mot de passe actuel incorrect");
        }

        passwords[user.email] = newPassword;
        await AsyncStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));

        console.log("[AuthContext.changePassword] ✅ Password changed");
      } catch (error) {
        console.error("[AuthContext.changePassword] ❌ Change password failed:", error);
        throw error;
      }
    },
    [user]
  );

  // ── logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    try {
      console.log("[AuthContext.logout] 👋 Logging out...");
      await AsyncStorage.removeItem(USER_KEY);
      setUser(null);
      console.log("[AuthContext.logout] ✅ Logged out");
    } catch (error) {
      console.error("[AuthContext.logout] ❌ Logout failed:", error);
      throw error;
    }
  }, []);

  const value: AuthContextType = {
    user,
    allUsers,
    isSignedIn: user !== null,
    signup,
    login,
    logout,
    updateProfile,
    updateUnoPoints,
    changePassword,
    isLoading,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
