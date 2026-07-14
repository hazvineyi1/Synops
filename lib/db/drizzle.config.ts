import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // POSIX-style relative glob, NOT path.join(__dirname, ...).
  //
  // On Windows path.join yields backslashes ("C:\...\src\schema\index.ts"), and
  // drizzle-kit passes this string to a GLOB matcher -- where a backslash is an escape
  // character, not a separator. The path therefore matched nothing and push failed with
  // "No schema files found", while printing a path that looked perfectly correct.
  // A forward-slash relative glob is resolved from this config's directory and works
  // on every platform. Globbing all files (not the barrel index.ts) also avoids
  // drizzle-kit's unreliable following of `export *` re-exports.
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
