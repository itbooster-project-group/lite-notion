import { readFile } from 'node:fs/promises';

import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

describe('semantic spacing theme', () => {
  it('keeps content spacing separate from the application shell width', async () => {
    const theme = await readFile('src/_app/styles/spacing.css', 'utf8');
    const compiler = await compile(`${theme}\n@tailwind utilities;`);
    const css = compiler.build(['gap-content', 'max-w-shell']);

    expect(css).toMatch(/\.gap-content\s*\{\s*gap: var\(--spacing-content\);\s*\}/);
    expect(css).toMatch(/\.max-w-shell\s*\{\s*max-width: var\(--container-shell\);\s*\}/);
  });
});
