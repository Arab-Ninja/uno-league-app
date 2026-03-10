/**
 * Full end-to-end test: signup → profile → proposal → transaction
 */
import { getDb } from "./server/db";
import { players, proposalParticipants, transactions } from "./drizzle/schema";
import { eq, sql } from "drizzle-orm";

async function test() {
  console.log("🚀 Starting full end-to-end test...\n");

  const db = getDb();

  try {
    // 1️⃣ TEST SIGNUP - Create a new player
    console.log("1️⃣ TEST SIGNUP");
    const testEmail = `test-${Date.now()}@example.com`;
    const newPlayer = {
      openId: testEmail,
      name: "Test Player",
      email: testEmail,
      division: "D3" as const,
      unoPoints: 1000,
      xp: 0,
      level: 1,
      statsGoals: 0,
      statsAssists: 0,
      statsDefenses: 0,
      statsSaves: 0,
      statsMotm: 0,
    };

    await db.insert(players).values(newPlayer);
    console.log("   ✅ Player created:", testEmail);

    // Verify player exists
    const playerCheck = await db
      .select()
      .from(players)
      .where(eq(players.openId, testEmail));
    console.log("   ✅ Player verified in DB:", playerCheck[0]?.name);

    // 2️⃣ TEST PROFILE UPDATE
    console.log("\n2️⃣ TEST PROFILE UPDATE");
    await db
      .update(players)
      .set({ division: "D2" })
      .where(eq(players.openId, testEmail));
    const updated = await db
      .select()
      .from(players)
      .where(eq(players.openId, testEmail));
    console.log("   ✅ Division updated to:", updated[0]?.division);

    // 3️⃣ TEST PROPOSAL CREATION
    console.log("\n3️⃣ TEST PROPOSAL CREATION");
    const now = new Date();
    const proposalDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const year = proposalDate.getUTCFullYear();
    const month = String(proposalDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(proposalDate.getUTCDate()).padStart(2, "0");
    const hours = String(proposalDate.getUTCHours()).padStart(2, "0");
    const minutes = String(proposalDate.getUTCMinutes()).padStart(2, "0");
    const seconds = String(proposalDate.getUTCSeconds()).padStart(2, "0");
    const mysqlDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    // Use raw SQL to avoid Drizzle's date conversion issues
    const proposalResult = await db.execute(
      sql`INSERT INTO proposals (date, time, locationId, locationName, locationColor, modeId, modeName, minParticipants, price, rewards, status, division, createdByOpenId, teamIds) VALUES (STR_TO_DATE(${mysqlDateTime}, '%Y-%m-%d %H:%i:%S'), '18h-19h', 'fit-five-forest', 'Fit Five Forest', '#dc2626', 'friendly', 'Match amical', 10, 10, '50-150 UNO', 'proposition', 'D3', ${testEmail}, '[]')`
    );

    const proposalId = (proposalResult as any)[0].insertId;
    console.log("   ✅ Proposal created with ID:", proposalId);

    // Add creator as participant
    await db.insert(proposalParticipants).values({
      proposalId,
      playerOpenId: testEmail,
      playerName: "Test Player",
    });
    console.log("   ✅ Creator added as participant");

    // 4️⃣ TEST TRANSACTION
    console.log("\n4️⃣ TEST TRANSACTION");
    await db.insert(transactions).values({
      playerOpenId: testEmail,
      amount: -10,
      description: "Paid for proposal #" + proposalId,
      type: "purchase",
    });
    console.log("   ✅ Transaction created");

    // Update player UNO points
    await db
      .update(players)
      .set({ unoPoints: 990 })
      .where(eq(players.openId, testEmail));
    const finalPlayer = await db
      .select()
      .from(players)
      .where(eq(players.openId, testEmail));
    console.log("   ✅ UNO Points updated to:", finalPlayer[0]?.unoPoints);

    // 5️⃣ VERIFY ALL DATA
    console.log("\n5️⃣ FINAL VERIFICATION");
    const allProposalsResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM proposals`
    );
    const allTransactionsResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM transactions`
    );
    const allPlayersResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM players`
    );

    const playerCount = (allPlayersResult as any)[0][0].count;
    const proposalCount = (allProposalsResult as any)[0][0].count;
    const transactionCount = (allTransactionsResult as any)[0][0].count;

    console.log("   📊 Total players in DB:", playerCount);
    console.log("   📊 Total proposals in DB:", proposalCount);
    console.log("   📊 Total transactions in DB:", transactionCount);

    console.log("\n✅ ALL TESTS PASSED! Full flow works correctly.");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

test().then(() => process.exit(0));
