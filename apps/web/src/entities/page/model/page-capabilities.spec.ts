import { describe, expect, it } from 'vitest';
import { getPageCapabilities } from './page-capabilities';

describe('page capabilities', () => {
  it.each([
    ['owner', true, true, true, true, true, true],
    ['editor', true, true, true, false, false, false],
    ['viewer', false, false, false, false, false, false],
  ] as const)('maps %s to granular capabilities', (role, ...expected) => {
    const capabilities = getPageCapabilities(role);
    expect([
      capabilities.canEditContent,
      capabilities.canCreateChild,
      capabilities.canRenamePage,
      capabilities.canMovePage,
      capabilities.canDeletePage,
      capabilities.canManageAccess,
    ]).toEqual(expected);
  });

  it('keeps canManagePage derived from edit/create/rename capabilities', () => {
    expect(getPageCapabilities('editor').canManagePage).toBe(true);
    expect(getPageCapabilities('viewer').canManagePage).toBe(false);
    expect(getPageCapabilities('owner').canManagePage).toBe(true);
  });
});
