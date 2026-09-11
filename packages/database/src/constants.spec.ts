import { describe, expect, it } from 'vitest';

import { DOCUMENT_MAX_BYTES, TIPTAP_SCHEMA_VERSION } from './constants';

describe('database document constants', () => {
  it('экспортирует persisted document contract', () => {
    expect(TIPTAP_SCHEMA_VERSION).toBe(1);
    expect(DOCUMENT_MAX_BYTES).toBe(1024 * 1024);
  });
});
