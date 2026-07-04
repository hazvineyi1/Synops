import { defineConfig } from "drizzle-kit";
import path from "path";
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  out: "./drizzle",
});
