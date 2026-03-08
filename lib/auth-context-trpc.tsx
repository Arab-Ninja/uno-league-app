import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";

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

interface AuthContextType {
  user: LocalPlayer | null;
  isLoading: boolean;
  isSignedIn: boolean;
  signup: (user: LocalPlayer) => Promise<void>;
  updateProfile: (user: Partial<LocalPlayer>) => Promise<void>;
  updateUnoPoints: (delta: number, description: string, type: "send" | "receive" | "purchase" | "reward") => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalPlayer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from AsyncStorage on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = await AsyncStorage.getItem("user");
        if (stored) {
          const parsedUser = JSON.parse(stored) as LocalPlayer;
          setUser(parsedUser);
          console.log("[AuthContext] User loaded from AsyncStorage:", parsedUser.name);
        }
      } catch (error) {
        console.error("[AuthContext] Failed to load user:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const signup = useCallback(
    async (newUser: LocalPlayer) => {
      try {
        console.log("[AuthContext.signup] 📝 Signing up user:", newUser.email);

        // Save to AsyncStorage first (for offline support)
        await AsyncStorage.setItem("user", JSON.stringify(newUser));
        setUser(newUser);

        // Then sync to backend via tRPC
        try {
          console.log("[AuthContext.signup] 🔄 Syncing to backend...");
          const result = await trpc.players.upsert.mutate({
            openId: newUser.openId,
            name: newUser.name,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            email: newUser.email,
            division: newUser.division,
            avatar: newUser.avatar,
            nationality: newUser.nationality,
            dateOfBirth: newUser.dateOfBirth,
            profilePhoto: newUser.profilePhoto,
            unoPoints: newUser.unoPoints,
            xp: newUser.xp,
            level: newUser.level,
          });
          console.log("[AuthContext.signup] ✅ User synced to TiDB:", result);
        } catch (syncError) {
          console.error("[AuthContext.signup] ⚠️  Failed to sync to backend:", syncError);
          // Don't throw - user is still logged in locally
        }
      } catch (error) {
        console.error("[AuthContext.signup] ❌ Signup failed:", error);
        throw error;
      }
    },
    []
  );

  const updateProfile = useCallback(
    async (updates: Partial<LocalPlayer>) => {
      if (!user) throw new Error("No user logged in");

      try {
        console.log("[AuthContext.updateProfile] 📝 Updating profile:", updates);

        const updated = { ...user, ...updates };

        // Save to AsyncStorage
        await AsyncStorage.setItem("user", JSON.stringify(updated));
        setUser(updated);

        // Sync to backend
        try {
          await trpc.players.upsert.mutate({
            openId: updated.openId,
            name: updated.name,
            firstName: updated.firstName,
            lastName: updated.lastName,
            email: updated.email,
            division: updated.division,
            avatar: updated.avatar,
            nationality: updated.nationality,
            dateOfBirth: updated.dateOfBirth,
            profilePhoto: updated.profilePhoto,
            unoPoints: updated.unoPoints,
            xp: updated.xp,
            level: updated.level,
          });
          console.log("[AuthContext.updateProfile] ✅ Profile synced to TiDB");
        } catch (syncError) {
          console.error("[AuthContext.updateProfile] ⚠️  Failed to sync:", syncError);
        }
      } catch (error) {
        console.error("[AuthContext.updateProfile] ❌ Update failed:", error);
        throw error;
      }
    },
    [user]
  );

  const updateUnoPoints = useCallback(
    async (delta: number, description: string, type: "send" | "receive" | "purchase" | "reward") => {
      if (!user) throw new Error("No user logged in");

      try {
        console.log("[AuthContext.updateUnoPoints] 📝 Updating UNO points:", { delta, type, description });

        const newPoints = Math.max(0, user.unoPoints + delta);
        const updated = { ...user, unoPoints: newPoints };

        // Save to AsyncStorage
        await AsyncStorage.setItem("user", JSON.stringify(updated));
        setUser(updated);

        // Sync to backend via tRPC
        try {
          await trpc.players.addPoints.mutate({
            openId: user.openId,
            delta,
            description,
            type,
          });
          console.log("[AuthContext.updateUnoPoints] ✅ UNO points synced to TiDB");
        } catch (syncError) {
          console.error("[AuthContext.updateUnoPoints] ⚠️  Failed to sync:", syncError);
        }
      } catch (error) {
        console.error("[AuthContext.updateUnoPoints] ❌ Update failed:", error);
        throw error;
      }
    },
    [user]
  );

  const logout = useCallback(async () => {
    try {
      console.log("[AuthContext.logout] 📝 Logging out");
      await AsyncStorage.removeItem("user");
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
    signup,
    updateProfile,
    updateUnoPoints,
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
