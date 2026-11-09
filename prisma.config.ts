import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  datasource: {
    // CLI/migrate needs the session connection (5432); runtime uses DATABASE_URL (pooler) via the PrismaPg adapter
    url: env("DIRECT_URL"),
  },
});