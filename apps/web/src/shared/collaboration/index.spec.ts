import { describe, expect, it, vi } from 'vitest';
import type { CollaborationProvider } from './index';

describe('collaboration provider contract', () => {
  it('exposes only the capabilities required by editor collaboration', () => {
    const provider = {
      awareness: null,
      connect: vi.fn(async () => undefined),
    } satisfies CollaborationProvider;

    expect(Object.keys(provider).sort()).toEqual(['awareness', 'connect']);
  });
});
