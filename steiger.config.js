import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  // Generated API code follows the generator's structure; specs use test-only imports outside the production public API.
  {
    ignores: ['./apps/web/src/shared/api/generated/**', '**/*.spec.ts', '**/*.spec.tsx'],
  },
  // Workaround for upstream prefix normalization in @feature-sliced/steiger-plugin 0.7.0 and
  // @feature-sliced/filesystem 3.1.0: layer discovery recognizes these prefixes, but the typo
  // rule compares the raw directory names. Recheck after either package is upgraded; a newer
  // release may normalize prefixed layers consistently and make this override unnecessary.
  {
    files: ['./apps/web/src/_app/**', './apps/web/src/_pages/**'],
    rules: {
      'fsd/typo-in-layer-name': 'off',
    },
  },
  // Workaround for the same upstream bug: sliced-layer detection reads the raw `_app` basename,
  // so these real application segments are mistaken for segmentless slices. Recheck this override
  // together with the prefix workaround after upgrading the FSD plugin/filesystem packages.
  {
    files: ['./apps/web/src/_app/layouts/**', './apps/web/src/_app/styles/**'],
    rules: {
      'fsd/no-segmentless-slices': 'off',
    },
  },
  // These widgets remain stable screen-level boundaries despite having at most one Steiger-visible consumer.
  {
    files: ['./apps/web/src/widgets/private-shell/**', './apps/web/src/widgets/profile-view/**'],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
]);
