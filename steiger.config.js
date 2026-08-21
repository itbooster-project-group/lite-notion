import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    ignores: ['./apps/web/src/shared/api/generated/**'],
  },
  {
    files: ['./apps/web/src/_app/**'],
    rules: {
      'fsd/typo-in-layer-name': 'off',
    },
  },
  {
    files: ['./apps/web/src/_app/**'],
    rules: {
      'fsd/no-segmentless-slices': 'off',
    },
  },
]);
