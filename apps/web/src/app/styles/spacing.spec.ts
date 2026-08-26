import { readFile } from 'node:fs/promises';

import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

describe('semantic spacing theme', () => {
  it('compiles only stable application layout tokens', async () => {
    const theme = await readFile('src/app/styles/spacing.css', 'utf8');
    const compiler = await compile(`${theme}\n@tailwind utilities;`);
    const css = compiler.build(['px-page-inline', 'py-page-block', 'max-w-shell', 'max-w-auth']);

    expect(css).toMatch(/\.px-page-inline\s*\{[^}]*var\(--spacing-page-inline\)/s);
    expect(css).toMatch(/\.py-page-block\s*\{[^}]*var\(--spacing-page-block\)/s);
    expect(css).toMatch(/\.max-w-shell\s*\{\s*max-width: var\(--container-shell\);\s*\}/);
    expect(css).toMatch(/\.max-w-auth\s*\{\s*max-width: var\(--container-auth\);\s*\}/);
  });
});
