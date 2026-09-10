import { describe, expect, it } from 'vitest';

import { pageRoomName } from './page-room-name';

describe('page collaboration room', () => {
  it('forms the canonical room from a page UUID', () => {
    expect(pageRoomName('4f8c0c7e-2b0c-4e9b-9d2d-0d0c6d9d8a11')).toBe(
      'page:4f8c0c7e-2b0c-4e9b-9d2d-0d0c6d9d8a11',
    );
  });
});
