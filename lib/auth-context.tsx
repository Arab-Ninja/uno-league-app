import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { currentPlayer, Player } from "./mock-data";

interface AuthContextType {
  user: Player | null;
  isLoading: boolean;
  isSignedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUnoPoints: (amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize user from storage or mock data
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        } else {
          // Set default user (Yassine)
          setUser(currentPlayer);
          await AsyncStorage.setItem("user", JSON.stringify(currentPlayer));
        }
      } catch (error) {
        console.error("Failed to initialize auth:", error);
        setUser(currentPlayer);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Mock login - in a real app, this would call an API
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      const mockUser = currentPlayer;
      setUser(mockUser);
      await AsyncStorage.setItem("user", JSON.stringify(mockUser));
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setUser(null);
      await AsyncStorage.removeItem("user");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const updateUnoPoints = async (amount: number) => {
    if (!user) return;
    
    const updatedUser = {
      ...user,
      unoPoints: Math.max(0, user.unoPoints + amount),
    };
    
    setUser(updatedUser);
    await AsyncStorage.setItem("user", JSON.stringify(updatedUser));
  };

  const value = {
    user,
    isLoading,
    isSignedIn: user !== null,
    login,
    logout,
    updateUnoPoints,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
