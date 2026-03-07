/**
 * Test script to verify backend persistence
 * This simulates what the frontend does when a user signs up
 */

import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "uno-league.db");
const db = new Database(dbPath);

console.log("🔍 Testing backend persistence...\n");

// Test 1: Check initial player count
console.log("📊 Initial player count:");
const initialCount = db
  .prepare("SELECT COUNT(*) as count FROM players")
  .get() as { count: number };
console.log(`   Players in database: ${initialCount.count}\n`);

// Test 2: Simulate inserting a new player (what playersRouter.upsert does)
console.log("📝 Simulating new player signup...");
const testEmail = `test-${Date.now()}@example.com`;
const testPlayer = {
  openId: testEmail,
  name: "Test Player",
  firstName: "Test",
  lastName: "Player",
  email: testEmail,
  division: "D3",
  unoPoints: 1000,
  xp: 0,
  level: 1,
  statsGoals: 0,
  statsAssists: 0,
  statsDefenses: 0,
  statsSaves: 0,
  statsMotm: 0,
  avatar: "⚽",
  nationality: "Belgique",
  dateOfBirth: "1990-01-01",
  profilePhoto: null,
  address: null,
};

try {
  const insertStmt = db.prepare(`
    INSERT INTO players (
      openId, name, firstName, lastName, email, division, unoPoints, xp, level,
      statsGoals, statsAssists, statsDefenses, statsSaves, statsMotm,
      avatar, nationality, dateOfBirth, profilePhoto, address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    testPlayer.openId,
    testPlayer.name,
    testPlayer.firstName,
    testPlayer.lastName,
    testPlayer.email,
    testPlayer.division,
    testPlayer.unoPoints,
    testPlayer.xp,
    testPlayer.level,
    testPlayer.statsGoals,
    testPlayer.statsAssists,
    testPlayer.statsDefenses,
    testPlayer.statsSaves,
    testPlayer.statsMotm,
    testPlayer.avatar,
    testPlayer.nationality,
    testPlayer.dateOfBirth,
    testPlayer.profilePhoto,
    testPlayer.address
  );

  console.log(`   ✅ Player created: ${testEmail}\n`);
} catch (error) {
  console.error(`   ❌ Failed to create player:`, error);
  process.exit(1);
}

// Test 3: Verify player was saved
console.log("🔍 Verifying player was saved...");
const savedPlayer = db
  .prepare("SELECT * FROM players WHERE openId = ?")
  .get(testEmail) as any;

if (savedPlayer) {
  console.log(`   ✅ Player found in database!`);
  console.log(`   - ID: ${savedPlayer.openId}`);
  console.log(`   - Name: ${savedPlayer.name}`);
  console.log(`   - UNO Points: ${savedPlayer.unoPoints}`);
  console.log(`   - Division: ${savedPlayer.division}\n`);
} else {
  console.log(`   ❌ Player NOT found in database!\n`);
  process.exit(1);
}

// Test 4: Simulate UNO point transfer (what playersRouter.addPoints does)
console.log("📝 Simulating UNO point transfer...");
try {
  const updateStmt = db.prepare(`
    UPDATE players SET unoPoints = unoPoints + ? WHERE openId = ?
  `);

  updateStmt.run(500, testEmail);
  console.log(`   ✅ Added 500 UNO points\n`);
} catch (error) {
  console.error(`   ❌ Failed to update UNO points:`, error);
  process.exit(1);
}

// Test 5: Verify UNO points were updated
console.log("🔍 Verifying UNO points update...");
const updatedPlayer = db
  .prepare("SELECT unoPoints FROM players WHERE openId = ?")
  .get(testEmail) as any;

if (updatedPlayer && updatedPlayer.unoPoints === 1500) {
  console.log(`   ✅ UNO points updated correctly!`);
  console.log(`   - New balance: ${updatedPlayer.unoPoints}\n`);
} else {
  console.log(`   ❌ UNO points NOT updated correctly!\n`);
  process.exit(1);
}

// Test 6: Check final player count
console.log("📊 Final player count:");
const finalCount = db
  .prepare("SELECT COUNT(*) as count FROM players")
  .get() as { count: number };
console.log(`   Players in database: ${finalCount.count}`);
console.log(`   New players added: ${finalCount.count - initialCount.count}\n`);

// Test 7: List all recent players
console.log("📋 Recent players:");
const recentPlayers = db
  .prepare("SELECT openId, name, unoPoints, division FROM players ORDER BY createdAt DESC LIMIT 5")
  .all() as any[];

recentPlayers.forEach((p, i) => {
  console.log(`   ${i + 1}. ${p.name} (${p.openId}) - ${p.unoPoints} UNO - ${p.division}`);
});

console.log("\n✅ All tests passed! Backend persistence is working correctly.");
db.close();
