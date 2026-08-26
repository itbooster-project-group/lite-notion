import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  // Generated API code follows the generator's structure; specs use test-only imports outside the production public API.
  {
    ignores: ['./apps/web/src/shared/api/generated/**', '**/*.spec.ts', '**/*.spec.tsx'],
  },
  // The private shell remains a stable screen-level boundary despite having one visible consumer.
  {
    files: ['./apps/web/src/widgets/private-shell/**'],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
]);
