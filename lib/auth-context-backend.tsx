/**
 * AuthContext v4 - Backend-first with TiDB persistence
 * 
 * This context:
 * 1. Calls tRPC backend to persist all data in TiDB
 * 2. Uses AsyncStorage for offline caching only
 * 3. Syncs data bidirectionally with backend
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";

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

interface AuthContextType {
  user: LocalPlayer | null;
  isLoading: boolean;
  isSignedIn: boolean;
  allUsers: LocalPlayer[];
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignUpData) => Promise<void>;
  updateProfile: (updates: Partial<LocalPlayer>) => Promise<void>;
  updateUnoPoints: (delta: number, description: string, type: "send" | "receive" | "purchase" | "reward") => Promise<void>;
  updatePlayerDivision: (openId: string, division: "D1" | "D2" | "D3") => Promise<void>;
  updateAllUsers: (users: LocalPlayer[]) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadAllUsersMap(): Promise<Record<string, LocalPlayer>> {
  try {
    const raw = await AsyncStorage.getItem(ALL_USERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LocalPlayer>) : {};
  } catch {
    return {};
  }
}

async function loadPasswordsMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(PASSWORDS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalPlayer | null>(null);
  const [allUsers, setAllUsers] = useState<LocalPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(USER_KEY);
        if (raw) {
          setUser(JSON.parse(raw) as LocalPlayer);
        }
      } catch (error) {
        console.error("[AuthContext] Failed to load user:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ── signup ─────────────────────────────────────────────────────────────────

  const signup = useCallback(async (data: SignUpData) => {
    try {
      console.log("[AuthContext.signup] 📝 Signing up:", data.email);

      const newUser: LocalPlayer = {
        openId: data.email,
        name: `${data.firstName} ${data.lastName}`,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        dateOfBirth: data.dateOfBirth,
        nationality: data.nationality,
        profilePhoto: data.profilePhoto ?? null,
        division: "D3",
        unoPoints: 1000,
        xp: 0,
        level: 1,
        statsGoals: 0,
        statsAssists: 0,
        statsDefenses: 0,
        statsSaves: 0,
        statsMotm: 0,
      };

      // 1️⃣ SAVE TO TIDB VIA tRPC BACKEND
      console.log("[AuthContext.signup] 🔄 Calling backend to save player...");
      const result = await trpc.players.upsert.mutate({
        openId: newUser.openId,
        name: newUser.name,
        email: newUser.email,
        division: newUser.division,
        unoPoints: newUser.unoPoints,
        xp: newUser.xp,
        level: newUser.level,
        statsGoals: newUser.statsGoals,
        statsAssists: newUser.statsAssists,
        statsDefenses: newUser.statsDefenses,
        statsSaves: newUser.statsSaves,
        statsMotm: newUser.statsMotm,
        avatar: newUser.avatar,
        nationality: newUser.nationality,
        dateOfBirth: newUser.dateOfBirth,
        profilePhoto: newUser.profilePhoto,
      });
      console.log("[AuthContext.signup] ✅ Player saved to TiDB:", result);

      // 2️⃣ Save to AsyncStorage for offline access
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
      setUser(newUser);

      // 3️⃣ Add to all-users map
      const usersMap = await loadAllUsersMap();
      usersMap[data.email] = newUser;
      await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(usersMap));
      setAllUsers(Object.values(usersMap));

      // 4️⃣ Save password locally
      const passwords = await loadPasswordsMap();
      passwords[data.email] = data.password;
      await AsyncStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));

      console.log("[AuthContext.signup] ✅ User signed up successfully:", newUser.name);
    } catch (error) {
      console.error("[AuthContext.signup] ❌ Signup failed:", error);
      throw error;
    }
  }, []);

  // ── login ──────────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    try {
      console.log("[AuthContext.login] 📝 Logging in:", email);

      const passwords = await loadPasswordsMap();
      if (passwords[email] !== password) {
        throw new Error("Invalid password");
      }

      const usersMap = await loadAllUsersMap();
      const loginUser = usersMap[email];
      if (!loginUser) {
        throw new Error("User not found");
      }

      await AsyncStorage.setItem(USER_KEY, JSON.stringify(loginUser));
      setUser(loginUser);
      console.log("[AuthContext.login] ✅ Logged in:", loginUser.name);
    } catch (error) {
      console.error("[AuthContext.login] ❌ Login failed:", error);
      throw error;
    }
  }, []);

  // ── updateProfile ──────────────────────────────────────────────────────────

  const updateProfile = useCallback(
    async (updates: Partial<LocalPlayer>) => {
      if (!user) throw new Error("No user logged in");
      try {
        console.log("[AuthContext.updateProfile] 📝 Updating profile:", updates);
        const updated = { ...user, ...updates };

        // 1️⃣ UPDATE IN TIDB VIA tRPC
        console.log("[AuthContext.updateProfile] 🔄 Calling backend...");
        await trpc.players.upsert.mutate({
          openId: updated.openId,
          name: updated.name,
          email: updated.email,
          division: updated.division,
          unoPoints: updated.unoPoints,
          xp: updated.xp,
          level: updated.level,
          statsGoals: updated.statsGoals,
          statsAssists: updated.statsAssists,
          statsDefenses: updated.statsDefenses,
          statsSaves: updated.statsSaves,
          statsMotm: updated.statsMotm,
          avatar: updated.avatar,
          nationality: updated.nationality,
          dateOfBirth: updated.dateOfBirth,
          profilePhoto: updated.profilePhoto,
        });
        console.log("[AuthContext.updateProfile] ✅ Profile saved to TiDB");

        // 2️⃣ Update AsyncStorage
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
        setUser(updated);

        // 3️⃣ Keep all-users map in sync
        const usersMap = await loadAllUsersMap();
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
    [user]
  );

  // ── updateUnoPoints ────────────────────────────────────────────────────────

  const updateUnoPoints = useCallback(
    async (delta: number, description: string, type: "send" | "receive" | "purchase" | "reward") => {
      if (!user) throw new Error("No user logged in");
      try {
        console.log("[AuthContext.updateUnoPoints] 📝 delta:", delta, description);
        const newPoints = Math.max(0, (user.unoPoints ?? 0) + delta);
        const updated = { ...user, unoPoints: newPoints };

        // 1️⃣ ADD TRANSACTION TO TIDB VIA tRPC
        console.log("[AuthContext.updateUnoPoints] 🔄 Calling backend to add transaction...");
        await trpc.players.addPoints.mutate({
          playerOpenId: user.openId,
          amount: delta,
          description: description,
          type: type,
        });
        console.log("[AuthContext.updateUnoPoints] ✅ Transaction saved to TiDB");

        // 2️⃣ UPDATE PLAYER IN TIDB
        await trpc.players.upsert.mutate({
          openId: updated.openId,
          name: updated.name,
          email: updated.email,
          division: updated.division,
          unoPoints: updated.unoPoints,
          xp: updated.xp,
          level: updated.level,
          statsGoals: updated.statsGoals,
          statsAssists: updated.statsAssists,
          statsDefenses: updated.statsDefenses,
          statsSaves: updated.statsSaves,
          statsMotm: updated.statsMotm,
          avatar: updated.avatar,
          nationality: updated.nationality,
          dateOfBirth: updated.dateOfBirth,
          profilePhoto: updated.profilePhoto,
        });
        console.log("[AuthContext.updateUnoPoints] ✅ Player updated in TiDB");

        // 3️⃣ Update AsyncStorage
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
        setUser(updated);

        // 4️⃣ Keep all-users map in sync
        const usersMap = await loadAllUsersMap();
        if (user.email && usersMap[user.email]) {
          usersMap[user.email] = updated;
          await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(usersMap));
          setAllUsers(Object.values(usersMap));
        }
        console.log("[AuthContext.updateUnoPoints] ✅ Points updated:", newPoints);
      } catch (error) {
        console.error("[AuthContext.updateUnoPoints] ❌ Update failed:", error);
        throw error;
      }
    },
    [user]
  );

  // ── updatePlayerDivision ───────────────────────────────────────────────────

  const updatePlayerDivision = useCallback(async (openId: string, division: "D1" | "D2" | "D3") => {
    try {
      console.log("[AuthContext.updatePlayerDivision] 📝 Updating division for:", openId);

      // Update in TiDB
      await trpc.players.upsert.mutate({
        openId,
        division,
      });
      console.log("[AuthContext.updatePlayerDivision] ✅ Division updated in TiDB");

      // Update local state if it's the current user
      if (user?.openId === openId) {
        const updated = { ...user, division };
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
        setUser(updated);
      }
    } catch (error) {
      console.error("[AuthContext.updatePlayerDivision] ❌ Update failed:", error);
      throw error;
    }
  }, [user]);

  // ── updateAllUsers ─────────────────────────────────────────────────────────

  const updateAllUsers = useCallback(async (users: LocalPlayer[]) => {
    try {
      const usersMap: Record<string, LocalPlayer> = {};
      users.forEach((u) => {
        if (u.email) usersMap[u.email] = u;
      });
      await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(usersMap));
      setAllUsers(users);
    } catch (error) {
      console.error("[AuthContext.updateAllUsers] ❌ Update failed:", error);
      throw error;
    }
  }, []);

  // ── logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    try {
      console.log("[AuthContext.logout] 📝 Logging out");
      await AsyncStorage.removeItem(USER_KEY);
      setUser(null);
      console.log("[AuthContext.logout] ✅ Logged out");
    } catch (error) {
      console.error("[AuthContext.logout] ❌ Logout failed:", error);
      throw error;
    }
  }, []);

  // ── Return provider ────────────────────────────────────────────────────────

  const value: AuthContextType = {
    user,
    isLoading,
    isSignedIn: !!user,
    allUsers,
    login,
    signup,
    updateProfile,
    updateUnoPoints,
    updatePlayerDivision,
    updateAllUsers,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
