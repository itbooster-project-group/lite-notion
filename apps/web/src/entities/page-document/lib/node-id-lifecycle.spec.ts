import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import {
  collectPageDocumentNodeIds,
  preparePageDocumentContentForInsertion,
} from './node-id-lifecycle';

const EXISTING_NODE_ID = '11111111-1111-4111-8111-111111111111';
const INSERTED_NODE_ID = '22222222-2222-4222-8222-222222222222';
const GENERATED_NODE_ID = '33333333-3333-4333-8333-333333333333';

function image(nodeId: string | null): JSONContent {
  return {
    attrs: {
      alt: 'Горы',
      decorative: false,
      nodeId,
      src: 'https://example.com/mountains.jpg',
    },
    type: 'image',
  };
}

describe('page document node ID lifecycle', () => {
  it('сохраняет уникальный persisted nodeId при обычной подготовке content', () => {
    const source = image(INSERTED_NODE_ID);

    const prepared = preparePageDocumentContentForInsertion(
      source,
      new Set([EXISTING_NODE_ID]),
      () => GENERATED_NODE_ID,
    );

    expect(prepared.attrs?.nodeId).toBe(INSERTED_NODE_ID);
    expect(source.attrs?.nodeId).toBe(INSERTED_NODE_ID);
  });

  it('deconflict-ит clone/paste/import ID без изменения исходного JSON', () => {
    const source = {
      content: [image(EXISTING_NODE_ID), image(null)],
      type: 'doc',
    } satisfies JSONContent;
    const generatedNodeIds = [INSERTED_NODE_ID, GENERATED_NODE_ID];

    const prepared = preparePageDocumentContentForInsertion(
      source,
      new Set([EXISTING_NODE_ID]),
      () => {
        const nextNodeId = generatedNodeIds.shift();
        if (!nextNodeId) throw new Error('Unexpected node ID request');
        return nextNodeId;
      },
    );

    expect(prepared).toMatchObject({
      content: [
        { attrs: { nodeId: INSERTED_NODE_ID }, type: 'image' },
        { attrs: { nodeId: GENERATED_NODE_ID }, type: 'image' },
      ],
    });
    expect(source.content?.map((node) => node.attrs?.nodeId)).toEqual([EXISTING_NODE_ID, null]);
  });

  it('собирает только валидные IDs custom media nodes для static mappings и insertion', () => {
    const document = {
      content: [
        image(EXISTING_NODE_ID),
        { attrs: { nodeId: 'invalid' }, type: 'youtube' },
        { attrs: { nodeId: INSERTED_NODE_ID }, type: 'paragraph' },
      ],
      type: 'doc',
    } satisfies JSONContent;

    expect(collectPageDocumentNodeIds(document)).toEqual(new Set([EXISTING_NODE_ID]));
  });
});
