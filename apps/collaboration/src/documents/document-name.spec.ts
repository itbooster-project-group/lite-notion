import { describe, expect, it } from 'vitest';

import { InvalidDocumentNameError, parsePageDocumentName } from './document-name';

describe('parsePageDocumentName', () => {
  it('принимает canonical page room', () => {
    expect(parsePageDocumentName('page:550e8400-e29b-41d4-a716-446655440000')).toEqual({
      documentName: 'page:550e8400-e29b-41d4-a716-446655440000',
      pageId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it.each([
    'page:not-a-uuid',
    'project:550e8400-e29b-41d4-a716-446655440000',
    'page:550e8400-e29b-41d4-a716-446655440000:extra',
    'page:550e8400-e29b-41d4-a716-446655440000?x=1',
  ])('отклоняет unsupported room %s', (name) => {
    expect(() => parsePageDocumentName(name)).toThrow(InvalidDocumentNameError);
  });
});
