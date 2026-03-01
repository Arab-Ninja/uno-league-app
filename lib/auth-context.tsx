import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { allPlayers, Player } from "./mock-data";

export interface SignUpData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  nationality: string;
  profilePhoto?: string;
}

interface AuthContextType {
  user: Player | null;
  isLoading: boolean;
  isSignedIn: boolean;
  allUsers: Player[];
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignUpData) => Promise<void>;
  logout: () => Promise<void>;
  updateUnoPoints: (userId: string, amount: number) => Promise<void>;
  updatePlayerDivision: (userId: string, division: "D1" | "D2" | "D3") => Promise<void>;
  updateAllUsers: (users: Player[]) => Promise<void>;
  getCurrentUser: () => Player | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<Player[]>(allPlayers);

  // Initialize auth from storage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("currentUser");
        const storedUsers = await AsyncStorage.getItem("allUsers");
        
        if (storedUsers) {
          setAllUsers(JSON.parse(storedUsers));
        } else {
          await AsyncStorage.setItem("allUsers", JSON.stringify(allPlayers));
        }

        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
        }
      } catch (error) {
        console.error("Failed to initialize auth:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const signup = async (data: SignUpData) => {
    setIsLoading(true);
    try {
      // Create new user
      const newUser: Player = {
        id: `player-${Date.now()}`,
        name: `${data.firstName} ${data.lastName}`,
        division: "D3", // New players start in D3
        unoPoints: 1000, // Starting bonus
        xp: 0,
        level: 1,
        stats: {
          goals: 0,
          assists: 0,
          defenses: 0,
          saves: 0,
          motm: 0,
        },
        avatar: "⚽",
        email: data.email,
        dateOfBirth: data.dateOfBirth,
        nationality: data.nationality,
        profilePhoto: data.profilePhoto,
      };

      // Add to users list
      const updatedUsers = [...allUsers, newUser];
      setAllUsers(updatedUsers);
      setUser(newUser);

      // Save to storage
      await AsyncStorage.setItem("currentUser", JSON.stringify(newUser));
      await AsyncStorage.setItem("allUsers", JSON.stringify(updatedUsers));
    } catch (error) {
      console.error("Signup failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Mock login - find user by email
      const foundUser = allUsers.find((u) => u.email === email);
      
      if (!foundUser) {
        throw new Error("User not found");
      }

      setUser(foundUser);
      await AsyncStorage.setItem("currentUser", JSON.stringify(foundUser));
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
      await AsyncStorage.removeItem("currentUser");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const updateUnoPoints = async (userId: string, amount: number) => {
    try {
      const updatedUsers = allUsers.map((u) =>
        u.id === userId ? { ...u, unoPoints: u.unoPoints + amount } : u
      );
      
      setAllUsers(updatedUsers);
      
      if (user?.id === userId) {
        const updatedUser = { ...user, unoPoints: user.unoPoints + amount };
        setUser(updatedUser);
        await AsyncStorage.setItem("currentUser", JSON.stringify(updatedUser));
      }
      
      await AsyncStorage.setItem("allUsers", JSON.stringify(updatedUsers));
    } catch (error) {
      console.error("Failed to update UNO points:", error);
      throw error;
    }
  };

  const updatePlayerDivision = async (userId: string, division: "D1" | "D2" | "D3") => {
    try {
      const updatedUsers = allUsers.map((u) =>
        u.id === userId ? { ...u, division } : u
      );
      
      setAllUsers(updatedUsers);
      
      if (user?.id === userId) {
        const updatedUser = { ...user, division };
        setUser(updatedUser);
        await AsyncStorage.setItem("currentUser", JSON.stringify(updatedUser));
      }
      
      await AsyncStorage.setItem("allUsers", JSON.stringify(updatedUsers));
    } catch (error) {
      console.error("Failed to update division:", error);
      throw error;
    }
  };

  const updateAllUsers = async (users: Player[]) => {
    try {
      setAllUsers(users);
      await AsyncStorage.setItem("allUsers", JSON.stringify(users));
    } catch (error) {
      console.error("Failed to update users:", error);
      throw error;
    }
  };

  const getCurrentUser = () => user;

  const value: AuthContextType = {
    user,
    isLoading,
    isSignedIn: user !== null,
    allUsers,
    login,
    signup,
    logout,
    updateUnoPoints,
    updatePlayerDivision,
    updateAllUsers,
    getCurrentUser,
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
