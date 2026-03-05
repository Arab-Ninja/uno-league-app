import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { allPlayers, Player } from "./mock-data";

// Key where we store a { email: password } map (plaintext is acceptable for
// this demo; passwords never leave the device).
const PASSWORDS_KEY = "userPasswords";

export interface SignUpData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  nationality: string;
  password: string;
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
  updateUserProfile: (data: Partial<Omit<SignUpData, "password">>) => Promise<void>;
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

  /** Returns the { email → password } map from AsyncStorage. */
  const getPasswords = async (): Promise<Record<string, string>> => {
    try {
      const raw = await AsyncStorage.getItem(PASSWORDS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const signup = async (data: SignUpData) => {
    setIsLoading(true);
    try {
      // Check if email already exists
      const currentUsers = allUsers;
      if (currentUsers.some((u) => u.email === data.email)) {
        throw new Error("Un compte avec cet email existe déjà");
      }

      // Create new user
      const newUser: Player = {
        id: `player-${Date.now()}`,
        name: `${data.firstName} ${data.lastName}`,
        firstName: data.firstName,
        lastName: data.lastName,
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

      // Store password separately
      const passwords = await getPasswords();
      passwords[data.email] = data.password;
      await AsyncStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));

      // Add to users list
      const updatedUsers = [...currentUsers, newUser];
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
      // Find user by email
      const foundUser = allUsers.find((u) => u.email === email);
      
      if (!foundUser) {
        throw new Error("Email ou mot de passe incorrect");
      }

      // Verify password — mock accounts (allPlayers) use "password123" by default
      const passwords = await getPasswords();
      const storedPassword = passwords[email] ?? "password123";
      if (storedPassword !== password) {
        throw new Error("Email ou mot de passe incorrect");
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

  const updateUserProfile = async (data: Partial<Omit<SignUpData, "password">>) => {
    try {
      if (!user) throw new Error("No user logged in");

      const updatedUser: Player = {
        ...user,
        name: `${data.firstName || user.firstName || user.name.split(" ")[0]} ${data.lastName || user.lastName || user.name.split(" ").slice(1).join(" ")}`.trim(),
        firstName: data.firstName ?? user.firstName,
        lastName: data.lastName ?? user.lastName,
        email: data.email ?? user.email,
        dateOfBirth: data.dateOfBirth ?? user.dateOfBirth,
        nationality: data.nationality ?? user.nationality,
        profilePhoto: data.profilePhoto ?? user.profilePhoto,
      };

      setUser(updatedUser);
      await AsyncStorage.setItem("currentUser", JSON.stringify(updatedUser));

      // Update in allUsers
      const updatedUsers = allUsers.map((u) => (u.id === user.id ? updatedUser : u));
      setAllUsers(updatedUsers);
      await AsyncStorage.setItem("allUsers", JSON.stringify(updatedUsers));
    } catch (error) {
      console.error("Failed to update profile:", error);
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
    updateUserProfile,
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
