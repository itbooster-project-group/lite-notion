import { describe, expect, it } from 'vitest';

import { PageRole, roleAtLeast } from './roles';

describe('roleAtLeast', () => {
  it('считает роль достаточной для неё самой', () => {
    for (const role of [PageRole.VIEWER, PageRole.EDITOR, PageRole.OWNER]) {
      expect(roleAtLeast(role, role)).toBe(true);
    }
  });

  it('включает viewer в editor', () => {
    expect(roleAtLeast(PageRole.EDITOR, PageRole.VIEWER)).toBe(true);
  });

  it('включает viewer и editor в owner', () => {
    expect(roleAtLeast(PageRole.OWNER, PageRole.VIEWER)).toBe(true);
    expect(roleAtLeast(PageRole.OWNER, PageRole.EDITOR)).toBe(true);
  });

  it('не поднимает viewer до editor и owner', () => {
    expect(roleAtLeast(PageRole.VIEWER, PageRole.EDITOR)).toBe(false);
    expect(roleAtLeast(PageRole.VIEWER, PageRole.OWNER)).toBe(false);
  });

  it('не поднимает editor до owner', () => {
    expect(roleAtLeast(PageRole.EDITOR, PageRole.OWNER)).toBe(false);
  });
});
