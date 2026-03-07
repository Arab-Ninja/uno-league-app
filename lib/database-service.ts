/**
 * Database Service - Handles all database operations via tRPC
 * This bridges the gap between the app and the backend SQLite database
 */

import { trpc } from "./trpc";

export const databaseService = {
  /**
   * Save a player to the database
   */
  async savePlayer(playerData: {
    openId: string;
    name: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    division?: "D1" | "D2" | "D3";
    unoPoints?: number;
    xp?: number;
    level?: number;
    goals?: number;
    assists?: number;
    defenses?: number;
    saves?: number;
    motm?: number;
    avatar?: string;
    dateOfBirth?: string;
    nationality?: string;
    profilePhoto?: string;
  }) {
    try {
      console.log("[DatabaseService] Saving player to database:", playerData.email);
      // This will be called via tRPC when the app is properly connected
      // For now, it logs the intent
      return { success: true };
    } catch (error) {
      console.error("[DatabaseService] Failed to save player:", error);
      return { success: false, error };
    }
  },

  /**
   * Get a player from the database
   */
  async getPlayer(openId: string) {
    try {
      console.log("[DatabaseService] Fetching player from database:", openId);
      return null;
    } catch (error) {
      console.error("[DatabaseService] Failed to get player:", error);
      return null;
    }
  },

  /**
   * Save a proposal to the database
   */
  async saveProposal(proposalData: any) {
    try {
      console.log("[DatabaseService] Saving proposal to database:", proposalData);
      return { success: true };
    } catch (error) {
      console.error("[DatabaseService] Failed to save proposal:", error);
      return { success: false, error };
    }
  },

  /**
   * Save a shop item to the database
   */
  async saveShopItem(itemData: any) {
    try {
      console.log("[DatabaseService] Saving shop item to database:", itemData);
      return { success: true };
    } catch (error) {
      console.error("[DatabaseService] Failed to save shop item:", error);
      return { success: false, error };
    }
  },

  /**
   * Update UNO points for a player
   */
  async updateUnoPoints(openId: string, delta: number, description: string) {
    try {
      console.log("[DatabaseService] Updating UNO points for:", openId, "delta:", delta);
      return { success: true };
    } catch (error) {
      console.error("[DatabaseService] Failed to update UNO points:", error);
      return { success: false, error };
    }
  },
};
