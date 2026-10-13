import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { projectDocument } from './document-projection';

type SchemaV1Fixture = Readonly<{
  schemaVersion: number;
  yjsUpdate: string;
  expectedContentJson: unknown;
}>;

const fixturePath = resolve(
  process.cwd(),
  '../../fixtures/page-document/schema-v1/rich-document.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as SchemaV1Fixture;

describe('document projection schema v1 compatibility', () => {
  it('preserves the real frontend Yjs fixture as ProseMirror JSON and image references', () => {
    const projection = projectDocument({
      yjsState: Uint8Array.from(Buffer.from(fixture.yjsUpdate, 'base64')),
      tiptapSchemaVersion: fixture.schemaVersion,
    });

    expect(projection.contentJson).toEqual(fixture.expectedContentJson);
    expect(projection.schemaVersion).toBe(1);
    expect(projection.mediaReferences).toEqual([
      {
        type: 'external',
        nodeId: '11111111-1111-4111-8111-111111111111',
        url: 'https://example.com/mountains.jpg',
      },
    ]);
  });
});
