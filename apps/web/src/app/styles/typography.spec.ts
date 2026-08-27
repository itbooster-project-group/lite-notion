import { readFile } from 'node:fs/promises';

import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

describe('semantic typography theme', () => {
  it('compiles shared primitive utilities against semantic tokens', async () => {
    const theme = await readFile('src/app/styles/typography.css', 'utf8');
    const compiler = await compile(`${theme}\n@tailwind utilities;`);
    const css = compiler.build([
      'text-heading-hero',
      'text-heading-page',
      'text-heading-section',
      'text-copy-body',
      'text-copy-small',
    ]);

    expect(css).toContain('--text-heading-hero: 2.25rem');
    expect(css).toContain('--text-heading-hero--line-height: 2.5rem');
    expect(css).toContain('--text-heading-page: 1.875rem');
    expect(css).toContain('--text-heading-section: 1.25rem');
    expect(css).toContain('--text-copy-body: 1rem');
    expect(css).toContain('--text-copy-small: 0.875rem');
    expect(css).toMatch(/\.text-heading-page\s*\{[^}]*font-size: var\(--text-heading-page\)/);
    expect(css).toMatch(/\.text-heading-page\s*\{[^}]*var\(--text-heading-page--line-height\)/);
    expect(css).toMatch(/\.text-copy-small\s*\{[^}]*font-size: var\(--text-copy-small\)/);
    expect(css).toMatch(/\.text-copy-small\s*\{[^}]*var\(--text-copy-small--line-height\)/);
  });
});
