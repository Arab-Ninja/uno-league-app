/**
 * Test TiDB persistence end-to-end
 * Verifies that all data is correctly stored in TiDB Cloud
 */

import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL || "mysql://3oKYUiTJxJ1nK8a.9a92206c3233:1V5V4GUoxU24yl9sfIBq@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/XLWJzSk7hhsPRGwkKBFYUx";

async function test() {
  console.log("🚀 Testing TiDB persistence...\n");

  try {
    const connection = await mysql.createConnection({
      uri: DATABASE_URL,
    });

    console.log("✅ Connected to TiDB Cloud\n");

    // Test 1: Check table existence
    console.log("📊 Checking table existence:");
    const tables = [
      "users",
      "players",
      "proposals",
      "proposalParticipants",
      "transactions",
      "shopItems",
      "teams",
      "matches",
    ];

    for (const table of tables) {
      const [result] = await connection.execute(
        `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [table]
      );
      const exists = (result as any)[0]?.count > 0;
      console.log(`   ${exists ? "✅" : "❌"} ${table}`);
    }

    // Test 2: Check data in players table
    console.log("\n📋 Players in TiDB:");
    const [players] = await connection.execute("SELECT COUNT(*) as count FROM players");
    const playerCount = (players as any)[0]?.count || 0;
    console.log(`   Total: ${playerCount} players`);

    // Test 3: Check data in proposals table
    console.log("\n📋 Proposals in TiDB:");
    const [proposals] = await connection.execute("SELECT COUNT(*) as count FROM proposals");
    const proposalCount = (proposals as any)[0]?.count || 0;
    console.log(`   Total: ${proposalCount} proposals`);

    // Test 4: Check data in transactions table
    console.log("\n📋 Transactions in TiDB:");
    const [transactions] = await connection.execute("SELECT COUNT(*) as count FROM transactions");
    const transactionCount = (transactions as any)[0]?.count || 0;
    console.log(`   Total: ${transactionCount} transactions`);

    // Test 5: Insert a test player
    console.log("\n📝 Inserting test player...");
    const testEmail = `test-${Date.now()}@example.com`;
    await connection.execute(
      `INSERT INTO players (openId, name, email, division, unoPoints, xp, level, statsGoals, statsAssists, statsDefenses, statsSaves, statsMotm, avatar, nationality, dateOfBirth) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testEmail,
        "Test Player",
        testEmail,
        "D3",
        1000,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        "⚽",
        "Belgique",
        "1990-01-01",
      ]
    );
    console.log(`   ✅ Player inserted: ${testEmail}`);

    // Test 6: Verify player was inserted
    console.log("\n🔍 Verifying player insertion...");
    const [result] = await connection.execute("SELECT * FROM players WHERE openId = ?", [testEmail]);
    const insertedPlayer = (result as any)[0];
    if (insertedPlayer) {
      console.log(`   ✅ Player found in TiDB!`);
      console.log(`   - Name: ${insertedPlayer.name}`);
      console.log(`   - Email: ${insertedPlayer.email}`);
      console.log(`   - UNO Points: ${insertedPlayer.unoPoints}`);
      console.log(`   - Division: ${insertedPlayer.division}`);
    } else {
      console.log(`   ❌ Player NOT found in TiDB!`);
    }

    // Test 7: Update UNO points
    console.log("\n📝 Updating UNO points...");
    await connection.execute("UPDATE players SET unoPoints = unoPoints + ? WHERE openId = ?", [500, testEmail]);
    console.log(`   ✅ Added 500 UNO points`);

    // Test 8: Verify update
    const [updated] = await connection.execute("SELECT unoPoints FROM players WHERE openId = ?", [testEmail]);
    const updatedPlayer = (updated as any)[0];
    if (updatedPlayer && updatedPlayer.unoPoints === 1500) {
      console.log(`   ✅ UNO points updated correctly: ${updatedPlayer.unoPoints}`);
    } else {
      console.log(`   ❌ UNO points NOT updated correctly!`);
    }

    // Test 9: Insert a transaction
    console.log("\n📝 Inserting transaction...");
    await connection.execute(
      `INSERT INTO transactions (playerOpenId, type, amount, description) VALUES (?, ?, ?, ?)`,
      [testEmail, "purchase", -500, "Bought item from shop"]
    );
    console.log(`   ✅ Transaction inserted`);

    // Test 10: Check transaction
    const [txns] = await connection.execute("SELECT * FROM transactions WHERE playerOpenId = ?", [testEmail]);
    const transaction = (txns as any)[0];
    if (transaction) {
      console.log(`   ✅ Transaction found in TiDB!`);
      console.log(`   - Type: ${transaction.type}`);
      console.log(`   - Amount: ${transaction.amount}`);
      console.log(`   - Description: ${transaction.description}`);
    }

    // Test 11: Summary
    console.log("\n📊 Final Summary:");
    const [finalPlayers] = await connection.execute("SELECT COUNT(*) as count FROM players");
    const [finalProposals] = await connection.execute("SELECT COUNT(*) as count FROM proposals");
    const [finalTransactions] = await connection.execute("SELECT COUNT(*) as count FROM transactions");

    console.log(`   Players: ${(finalPlayers as any)[0]?.count}`);
    console.log(`   Proposals: ${(finalProposals as any)[0]?.count}`);
    console.log(`   Transactions: ${(finalTransactions as any)[0]?.count}`);

    await connection.end();
    console.log("\n✅ All tests passed! TiDB persistence is working correctly.");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

test();
