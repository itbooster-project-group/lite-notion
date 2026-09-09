import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const localDatabaseUrl =
  'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public';

const variableReference = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const maxExpansionDepth = 8;

const expandVariables = (value: string): string => {
  let expanded = value;

  for (let depth = 0; depth < maxExpansionDepth; depth += 1) {
    const next = expanded.replace(
      variableReference,
      (reference, name: string) => process.env[name] ?? reference,
    );

    if (next === expanded) {
      break;
    }

    expanded = next;
  }

  return expanded;
};

export default defineConfig({
  datasource: {
    url: expandVariables(process.env.DATABASE_URL ?? localDatabaseUrl),
  },
  migrations: {
    path: 'prisma/migrations',
  },
  schema: 'prisma/schema.prisma',
});
