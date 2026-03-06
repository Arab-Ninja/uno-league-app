import { defineConfig } from "drizzle-kit";
import { ENV } from "./server/_core/env";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: ENV.databaseUrl,
  },
});
