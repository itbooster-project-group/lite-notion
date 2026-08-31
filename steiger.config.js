import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  // Generated API code follows the generator's structure; specs use test-only imports outside the production public API.
  {
    ignores: ['./apps/web/src/shared/api/generated/**', '**/*.spec.ts', '**/*.spec.tsx'],
  },
  // Editor core is intentionally isolated until a separate Hocuspocus change adds production composition.
  {
    files: [
      './apps/web/src/entities/page-document/**',
      './apps/web/src/features/page-editing/**',
      './apps/web/src/widgets/page-editor/**',
    ],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
]);
