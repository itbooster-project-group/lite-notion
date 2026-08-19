import "dotenv/config";

import { defineConfig } from "prisma/config";

const localDatabaseUrl =
  "postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public";

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
  migrations: {
    path: "prisma/migrations",
  },
  schema: "prisma/schema.prisma",
});
