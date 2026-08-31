import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function test() {
  console.log("🚀 Testing simple proposal insertion...\n");
  const db = getDb();

  try {
    const testEmail = `test-${Date.now()}@example.com`;
    
    // Simple INSERT with all columns explicitly cast
    const result = await db.execute(
      sql`INSERT INTO proposals (date, time, locationId, locationName, locationColor, modeId, modeName, minParticipants, price, rewards, status, division, createdByOpenId, teamIds) 
          VALUES (NOW(), '18h-19h', 'fit-five-forest', 'Fit Five Forest', '#dc2626', 'friendly', 'Match amical', 10, 10, '50-150 UNO', 'proposition', 'D3', ${testEmail}, JSON_ARRAY())`
    );

    const proposalId = (result as any)[0].insertId;
    console.log("✅ Proposal created with ID:", proposalId);
    
    // Verify it exists
    const check = await db.execute(
      sql`SELECT id, date, createdByOpenId FROM proposals WHERE id = ${proposalId}`
    );
    console.log("✅ Proposal verified:", (check as any)[0][0]);
    
    console.log("\n✅ TEST PASSED!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

test().then(() => process.exit(0));
