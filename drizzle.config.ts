import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "mysql://3oKYUiTJxJ1nK8a.9a92206c3233:1V5V4GUoxU24yl9sfIBq@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/XLWJzSk7hhsPRGwkKBFYUx",
  },
});
