import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Schema } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DOCUMENT_PROJECTION_SCHEMA_VERSION,
  documentProjectionSchema,
} from '../../../../../api/src/document-projection/document-projection.schema';
import { getPageDocumentSchema } from '../model/editor-schema';
import { PAGE_DOCUMENT_SCHEMA_VERSION } from '../model/schema-version';
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

function schemaAttrs(schema: ReturnType<typeof getPageDocumentSchema>, name: string) {
  const nodeType = schema.nodes[name];
  const markType = schema.marks[name];
  const attrs = nodeType?.spec.attrs ?? markType?.spec.attrs ?? {};
  return Object.fromEntries(
    Object.entries(attrs).map(([attr, definition]) => [attr, definition.default]),
  );
}

function compareSchemas(
  frontendSchema: ReturnType<typeof getPageDocumentSchema>,
  backendSchema: typeof documentProjectionSchema,
  frontendVersion: number,
  backendVersion: number,
): string[] {
  const differences: string[] = [];
  if (frontendVersion !== backendVersion) {
    differences.push(
      `schema version differs: frontend ${frontendVersion}, backend ${backendVersion}`,
    );
  }

  for (const kind of ['node', 'mark'] as const) {
    const frontendTypes = kind === 'node' ? frontendSchema.nodes : frontendSchema.marks;
    const backendTypes = kind === 'node' ? backendSchema.nodes : backendSchema.marks;
    const frontendNames = Object.keys(frontendTypes).sort();
    const backendNames = Object.keys(backendTypes).sort();

    for (const name of frontendNames.filter((item) => !backendNames.includes(item))) {
      differences.push(`${kind} "${name}" exists only in frontend`);
    }
    for (const name of backendNames.filter((item) => !frontendNames.includes(item))) {
      differences.push(`${kind} "${name}" exists only in backend`);
    }

    for (const name of frontendNames.filter((item) => backendNames.includes(item))) {
      const frontendAttrs = schemaAttrs(frontendSchema, name);
      const backendAttrs = schemaAttrs(backendSchema, name);
      const frontendAttrNames = Object.keys(frontendAttrs).sort();
      const backendAttrNames = Object.keys(backendAttrs).sort();
      for (const attr of frontendAttrNames.filter((item) => !backendAttrNames.includes(item))) {
        differences.push(`${kind} "${name}" attr "${attr}" exists only in frontend`);
      }
      for (const attr of backendAttrNames.filter((item) => !frontendAttrNames.includes(item))) {
        differences.push(`${kind} "${name}" attr "${attr}" exists only in backend`);
      }
      for (const attr of frontendAttrNames.filter((item) => backendAttrNames.includes(item))) {
        if (JSON.stringify(frontendAttrs[attr]) !== JSON.stringify(backendAttrs[attr])) {
          differences.push(
            `${kind} "${name}" attr "${attr}" default differs: frontend ${JSON.stringify(frontendAttrs[attr])}, backend ${JSON.stringify(backendAttrs[attr])}`,
          );
        }
      }
    }
  }

  return differences;
}

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

  it('keeps backend nodes, marks, persisted attrs, defaults, and version aligned with frontend', () => {
    const differences = compareSchemas(
      getPageDocumentSchema(),
      documentProjectionSchema,
      PAGE_DOCUMENT_SCHEMA_VERSION,
      DOCUMENT_PROJECTION_SCHEMA_VERSION,
    );

    expect(differences, differences.join('\n')).toEqual([]);
  });

  it('reports node, mark, attr, and default drift with specific differences', () => {
    const sourceSchema = getPageDocumentSchema();
    const nodes = Object.fromEntries(
      Object.entries(sourceSchema.nodes).map(([name, nodeType]) => [name, nodeType.spec]),
    );
    const marks = Object.fromEntries(
      Object.entries(sourceSchema.marks).map(([name, markType]) => [name, markType.spec]),
    );
    const imageSpec = sourceSchema.nodes.image?.spec;
    if (!imageSpec) throw new Error('Frontend schema is missing the image node.');
    const imageAttrs = { ...imageSpec.attrs };
    delete imageAttrs.src;
    imageAttrs.alignment = { default: 'start' };
    imageAttrs.reviewOnly = { default: false };
    const frontendSchema = new Schema({
      nodes: {
        ...nodes,
        image: { ...imageSpec, attrs: imageAttrs },
        reviewOnlyNode: { group: 'block' },
      },
      marks: { ...marks, reviewOnlyMark: {} },
    });

    expect(
      compareSchemas(
        frontendSchema,
        documentProjectionSchema,
        PAGE_DOCUMENT_SCHEMA_VERSION,
        DOCUMENT_PROJECTION_SCHEMA_VERSION + 1,
      ),
    ).toEqual(
      expect.arrayContaining([
        'node "reviewOnlyNode" exists only in frontend',
        'mark "reviewOnlyMark" exists only in frontend',
        'node "image" attr "reviewOnly" exists only in frontend',
        'node "image" attr "src" exists only in backend',
        'node "image" attr "alignment" default differs: frontend "start", backend "center"',
        `schema version differs: frontend ${PAGE_DOCUMENT_SCHEMA_VERSION}, backend ${DOCUMENT_PROJECTION_SCHEMA_VERSION + 1}`,
      ]),
    );
  });
});
