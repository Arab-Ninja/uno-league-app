/**
 * AuthContext v3.1 - Local-first with AsyncStorage, TiDB sync via PlayerSyncProvider
 *
 * This context:
 * 1. Stores auth state locally in AsyncStorage (for immediate UI feedback + offline)
 * 2. Exposes login/signup/logout and user profile management
 * 3. TiDB persistence is handled by PlayerSyncProvider (inside tRPC context)
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
  /** @deprecated Use flat statsGoals, statsAssists, etc. Kept for backward compatibility with old stored data. */
  stats?: {
    goals?: number;
    assists?: number;
    defenses?: number;
    saves?: number;
    motm?: number;
  };
}

/** Data collected from the signup form. */
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

  // Load user and all-users list from AsyncStorage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [stored, usersMap] = await Promise.all([
          AsyncStorage.getItem(USER_KEY),
          loadAllUsersMap(),
        ]);
        if (stored) {
          const parsedUser = JSON.parse(stored) as LocalPlayer;
          setUser(parsedUser);
          console.log("[AuthContext] ✅ User loaded:", parsedUser.name);
        }
        setAllUsers(Object.values(usersMap));
      } catch (error) {
        console.error("[AuthContext] ❌ Failed to load user:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // ── login ──────────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    try {
      console.log("[AuthContext.login] 📝 Logging in:", email);
      const [usersMap, passwords] = await Promise.all([
        loadAllUsersMap(),
        loadPasswordsMap(),
      ]);

      const storedUser = usersMap[email];
      const storedPassword = passwords[email];

      if (!storedUser || storedPassword !== password) {
        throw new Error("Email ou mot de passe incorrect");
      }

      await AsyncStorage.setItem(USER_KEY, JSON.stringify(storedUser));
      setUser(storedUser);
      setAllUsers(Object.values(usersMap));
      console.log("[AuthContext.login] ✅ Logged in:", storedUser.name);
    } catch (error) {
      console.error("[AuthContext.login] ❌ Login failed:", error);
      throw error;
    }
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

      // Save current user
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
      setUser(newUser);

      // Add to all-users map (for login lookup)
      const usersMap = await loadAllUsersMap();
      usersMap[data.email] = newUser;
      await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(usersMap));
      setAllUsers(Object.values(usersMap));

      // Save password
      const passwords = await loadPasswordsMap();
      passwords[data.email] = data.password;
      await AsyncStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));

      console.log("[AuthContext.signup] ✅ User signed up:", newUser.name);
    } catch (error) {
      console.error("[AuthContext.signup] ❌ Signup failed:", error);
      throw error;
    }
  }, []);

  // ── updateProfile ──────────────────────────────────────────────────────────

  const updateProfile = useCallback(async (updates: Partial<LocalPlayer>) => {
    if (!user) throw new Error("No user logged in");
    try {
      console.log("[AuthContext.updateProfile] 📝 Updating profile:", updates);
      const updated = { ...user, ...updates };
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
      setUser(updated);

      // Keep all-users map in sync
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
  }, [user]);

  // ── updateUnoPoints ────────────────────────────────────────────────────────

  const updateUnoPoints = useCallback(
    async (delta: number, description: string, _type: "send" | "receive" | "purchase" | "reward") => {
      // _type is kept in the signature for API compatibility with callers (admin, wallet, shop, calendar).
      // In this local-first implementation, type classification is not stored locally.
      if (!user) throw new Error("No user logged in");
      try {
        console.log("[AuthContext.updateUnoPoints] 📝 delta:", delta, description);
        const newPoints = Math.max(0, (user.unoPoints ?? 0) + delta);
        const updated = { ...user, unoPoints: newPoints };
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
        setUser(updated);

        // Keep all-users map in sync
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
    [user],
  );

  // ── updatePlayerDivision ───────────────────────────────────────────────────

  const updatePlayerDivision = useCallback(
    async (openId: string, division: "D1" | "D2" | "D3") => {
      try {
        const usersMap = await loadAllUsersMap();
        const target = usersMap[openId];
        if (target) {
          usersMap[openId] = { ...target, division };
          await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(usersMap));
          setAllUsers(Object.values(usersMap));
        }
        if (user && (user.openId === openId || user.email === openId)) {
          const updated = { ...user, division };
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
          setUser(updated);
        }
      } catch (error) {
        console.error("[AuthContext.updatePlayerDivision] ❌ Update failed:", error);
        throw error;
      }
    },
    [user],
  );

  // ── updateAllUsers ─────────────────────────────────────────────────────────

  const updateAllUsers = useCallback(async (users: LocalPlayer[]) => {
    try {
      const usersMap: Record<string, LocalPlayer> = {};
      for (const u of users) {
        usersMap[u.email ?? u.openId] = u;
      }
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
