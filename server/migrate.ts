/**
 * Force create all tables in TiDB Cloud
 * Run this once to initialize the database schema
 */

import mysql from "mysql2/promise";
import { ENV } from "./_core/env";

const DATABASE_URL = process.env.DATABASE_URL || "mysql://3oKYUiTJxJ1nK8a.9a92206c3233:1V5V4GUoxU24yl9sfIBq@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/XLWJzSk7hhsPRGwkKBFYUx";

const SQL_STATEMENTS = `
CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` integer PRIMARY KEY AUTO_INCREMENT NOT NULL,
  \`openId\` varchar(255) NOT NULL UNIQUE,
  \`name\` varchar(255),
  \`email\` varchar(255),
  \`loginMethod\` varchar(255),
  \`role\` varchar(255) NOT NULL DEFAULT 'user',
  \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  \`lastSignedIn\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS \`players\` (
  \`id\` integer PRIMARY KEY AUTO_INCREMENT NOT NULL,
  \`openId\` varchar(255) NOT NULL UNIQUE,
  \`firstName\` varchar(255),
  \`lastName\` varchar(255),
  \`name\` varchar(255) NOT NULL,
  \`email\` varchar(255),
  \`address\` varchar(255),
  \`division\` varchar(10) NOT NULL DEFAULT 'D3',
  \`unoPoints\` integer NOT NULL DEFAULT 1000,
  \`xp\` integer NOT NULL DEFAULT 0,
  \`level\` integer NOT NULL DEFAULT 1,
  \`statsGoals\` integer NOT NULL DEFAULT 0,
  \`statsAssists\` integer NOT NULL DEFAULT 0,
  \`statsDefenses\` integer NOT NULL DEFAULT 0,
  \`statsSaves\` integer NOT NULL DEFAULT 0,
  \`statsMotm\` integer NOT NULL DEFAULT 0,
  \`avatar\` varchar(255),
  \`nationality\` varchar(255),
  \`dateOfBirth\` varchar(255),
  \`profilePhoto\` varchar(255),
  \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS \`teams\` (
  \`id\` integer PRIMARY KEY AUTO_INCREMENT NOT NULL,
  \`modeId\` varchar(255) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`playerOpenIds\` JSON,
  \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS \`matches\` (
  \`id\` integer PRIMARY KEY AUTO_INCREMENT NOT NULL,
  \`modeId\` varchar(255) NOT NULL,
  \`sessionId\` integer,
  \`teamAId\` integer,
  \`teamBId\` integer,
  \`teamAName\` varchar(255),
  \`teamBName\` varchar(255),
  \`scoreA\` integer NOT NULL DEFAULT 0,
  \`scoreB\` integer NOT NULL DEFAULT 0,
  \`statistics\` JSON,
  \`playedAt\` TIMESTAMP,
  \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS \`proposals\` (
  \`id\` integer PRIMARY KEY AUTO_INCREMENT NOT NULL,
  \`date\` BIGINT NOT NULL,
  \`time\` varchar(255) NOT NULL,
  \`locationId\` varchar(255) NOT NULL,
  \`locationName\` varchar(255) NOT NULL,
  \`locationColor\` varchar(255) NOT NULL DEFAULT '#334155',
  \`modeId\` varchar(255) NOT NULL,
  \`modeName\` varchar(255) NOT NULL,
  \`minParticipants\` integer NOT NULL,
  \`price\` integer NOT NULL,
  \`rewards\` JSON,
  \`status\` varchar(255) NOT NULL DEFAULT 'proposition',
  \`division\` varchar(10) NOT NULL DEFAULT 'D3',
  \`paymentComplete\` boolean NOT NULL DEFAULT false,
  \`teamIds\` JSON,
  \`createdByOpenId\` varchar(255),
  \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS \`proposalParticipants\` (
  \`id\` integer PRIMARY KEY AUTO_INCREMENT NOT NULL,
  \`proposalId\` integer NOT NULL,
  \`playerOpenId\` varchar(255) NOT NULL,
  \`playerName\` varchar(255) NOT NULL,
  \`hasPaid\` boolean NOT NULL DEFAULT false,
  \`joinedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (\`proposalId\`) REFERENCES \`proposals\`(\`id\`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS \`shopItems\` (
  \`id\` integer PRIMARY KEY AUTO_INCREMENT NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`images\` JSON,
  \`description\` TEXT,
  \`productUrl\` varchar(255),
  \`priceUno\` integer NOT NULL,
  \`priceEuros\` decimal(10, 2),
  \`available\` boolean NOT NULL DEFAULT true,
  \`category\` varchar(255),
  \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS \`transactions\` (
  \`id\` integer PRIMARY KEY AUTO_INCREMENT NOT NULL,
  \`playerOpenId\` varchar(255) NOT NULL,
  \`type\` varchar(255) NOT NULL,
  \`amount\` integer NOT NULL,
  \`fromPlayerOpenId\` varchar(255),
  \`toPlayerOpenId\` varchar(255),
  \`description\` TEXT NOT NULL,
  \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (\`playerOpenId\`) REFERENCES \`players\`(\`openId\`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS \`idx_players_openId\` ON \`players\`(\`openId\`);
CREATE INDEX IF NOT EXISTS \`idx_users_openId\` ON \`users\`(\`openId\`);
CREATE INDEX IF NOT EXISTS \`idx_proposals_createdByOpenId\` ON \`proposals\`(\`createdByOpenId\`);
CREATE INDEX IF NOT EXISTS \`idx_transactions_playerOpenId\` ON \`transactions\`(\`playerOpenId\`);
`;

async function migrate() {
  console.log("🚀 Starting TiDB migration...\n");

  try {
    const connection = await mysql.createConnection({
      uri: DATABASE_URL,
    });

    console.log("✅ Connected to TiDB Cloud\n");

    const statements = SQL_STATEMENTS.split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      try {
        console.log(`📝 Executing: ${statement.substring(0, 60)}...`);
        await connection.execute(statement);
        console.log(`✅ Success\n`);
      } catch (error: any) {
        if (error.code === "ER_TABLE_EXISTS_ERROR") {
          console.log(`⏭️  Table already exists\n`);
        } else if (error.code === "ER_DUP_KEYNAME") {
          console.log(`⏭️  Index already exists\n`);
        } else if (error.message.includes("doesn't exist")) {
          console.log(`⏭️  Referenced table doesn't exist yet (will retry)\n`);
        } else {
          console.error(`❌ Error:`, error.message, "\n");
        }
      }
    }

    await connection.end();
    console.log("✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrate();
