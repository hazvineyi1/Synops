import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // Relative forward-slash glob so drizzle-kit finds the schema on Windows too
  // (absolute backslash paths from path.join break its file matching).
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    // Supabase/managed Postgres require TLS; don't hard-fail on the cert chain.
    ssl: { rejectUnauthorized: false },
  },
});
