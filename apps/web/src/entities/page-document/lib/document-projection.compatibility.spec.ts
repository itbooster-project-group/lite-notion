import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { decodePageDocumentState, pageDocumentToJSON } from './yjs-state';

type SchemaV1Fixture = Readonly<{
  schemaVersion: number;
  yjsUpdate: string;
  expectedContentJson: unknown;
}>;

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../../fixtures/page-document/schema-v1/rich-document.json'),
    'utf8',
  ),
) as SchemaV1Fixture;

describe('document projection schema v1 fixture compatibility', () => {
  let document: ReturnType<typeof decodePageDocumentState> | undefined;

  afterEach(() => {
    document?.destroy();
    document = undefined;
  });

  it('matches the current frontend Yjs conversion', () => {
    document = decodePageDocumentState(Uint8Array.from(Buffer.from(fixture.yjsUpdate, 'base64')));

    expect(fixture.schemaVersion).toBe(1);
    expect(pageDocumentToJSON(document)).toEqual(fixture.expectedContentJson);
  });
});
