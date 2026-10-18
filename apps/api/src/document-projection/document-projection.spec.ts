import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { projectDocument } from './document-projection';
import { DocumentProjectionError } from './document-projection.errors';

const IMAGE_ID = '11111111-1111-4111-8111-111111111111';
const VIDEO_ID = '22222222-2222-4222-8222-222222222222';
const YOUTUBE_ID = '33333333-3333-4333-8333-333333333333';

function createState(build: (fragment: Y.XmlFragment) => void): Uint8Array {
  const document = new Y.Doc();
  const fragment = document.getXmlFragment('default');
  build(fragment);
  const state = Y.encodeStateAsUpdate(document);
  document.destroy();
  return state;
}

function appendElement(
  parent: Y.XmlFragment | Y.XmlElement,
  type: string,
  attrs: Readonly<Record<string, unknown>> = {},
): Y.XmlElement {
  const element = new Y.XmlElement(type);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) element.setAttribute(key, value as string);
  }
  parent.insert(parent.length, [element]);
  return element;
}

function appendText(
  parent: Y.XmlElement,
  value: string,
  attributes?: Readonly<Record<string, unknown>>,
): Y.XmlText {
  const text = new Y.XmlText();
  if (value) text.insert(0, value, attributes);
  parent.insert(parent.length, [text]);
  return text;
}

function mediaAttrs(nodeId: string, src: string) {
  return {
    nodeId,
    src,
    alignment: 'center',
    caption: null,
    widthPercent: 100,
  };
}

function expectProjectionError(action: () => unknown, code: DocumentProjectionError['code']): void {
  try {
    action();
    expect.fail('Expected projectDocument to throw.');
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentProjectionError);
    expect(error).toMatchObject({ code });
  }
}

describe('projectDocument', () => {
  it('returns the current frontend-compatible empty document shape', () => {
    expect(projectDocument({ yjsState: new Uint8Array(), tiptapSchemaVersion: 1 })).toEqual({
      contentJson: { type: 'doc' },
      mediaReferences: [],
      schemaVersion: 1,
    });
  });

  it('converts paragraphs, text, and adjacent text segments without losing content', () => {
    const yjsState = createState((fragment) => {
      const first = appendElement(fragment, 'paragraph');
      appendText(first, 'Two ');
      appendText(first, 'adjacent segments');
      const second = appendElement(fragment, 'paragraph');
      appendText(second, 'Second paragraph');
    });

    expect(projectDocument({ yjsState, tiptapSchemaVersion: 1 }).contentJson).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Two adjacent segments' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
      ],
    });
  });

  it('accepts representation-only defaults, mark ordering, and adjacent equal-mark text', () => {
    const yjsState = createState((fragment) => {
      const heading = appendElement(fragment, 'heading');
      appendText(heading, 'First ', {
        italic: {},
        link: { href: 'https://example.com/heading' },
      });
      appendText(heading, 'second', {
        link: { href: 'https://example.com/heading' },
        italic: {},
      });
    });

    expect(projectDocument({ yjsState, tiptapSchemaVersion: 1 }).contentJson).toEqual({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            {
              type: 'text',
              text: 'First second',
              marks: [
                { type: 'link', attrs: { href: 'https://example.com/heading' } },
                { type: 'italic' },
              ],
            },
          ],
        },
      ],
    });
  });

  it('preserves schema-supported persisted node attrs and canonicalizes allowed link URLs', () => {
    const yjsState = createState((fragment) => {
      const heading = appendElement(fragment, 'heading', { level: 3 });
      appendText(heading, 'Heading');

      const orderedList = appendElement(fragment, 'orderedList', {
        start: -2,
        type: 'custom',
      });
      const listItem = appendElement(orderedList, 'listItem');
      appendText(appendElement(listItem, 'paragraph'), 'Item');

      const taskList = appendElement(fragment, 'taskList');
      const taskItem = appendElement(taskList, 'taskItem', { checked: true });
      appendText(appendElement(taskItem, 'paragraph'), 'Done');

      const paragraph = appendElement(fragment, 'paragraph');
      appendText(paragraph, 'http', { link: { href: 'http://example.com/path' } });
      appendText(paragraph, 'mail', { link: { href: 'mailto:editor@example.com' } });
      appendText(paragraph, 'bare', { link: { href: 'example.com/docs' } });
    });

    const projection = projectDocument({ yjsState, tiptapSchemaVersion: 1 });
    const [heading, orderedList, taskList, paragraph] = projection.contentJson.content ?? [];
    expect(heading?.attrs).toMatchObject({ level: 3 });
    expect(orderedList?.attrs).toMatchObject({ start: -2, type: 'custom' });
    expect(taskList?.content?.[0]?.attrs).toMatchObject({ checked: true });
    expect(paragraph?.content?.map((node) => node.marks?.[0]?.attrs?.href)).toEqual([
      'http://example.com/path',
      'mailto:editor@example.com',
      'https://example.com/docs',
    ]);
  });

  it('rejects malformed persisted node attrs and invalid link href values', () => {
    const cases = [
      createState((fragment) => appendElement(fragment, 'heading', { level: 0 })),
      createState((fragment) => appendElement(fragment, 'heading', { level: 4 })),
      createState((fragment) => appendElement(fragment, 'heading', { level: '2' })),
      createState((fragment) => {
        const taskList = appendElement(fragment, 'taskList');
        appendElement(taskList, 'taskItem', { checked: 'false' });
      }),
      createState((fragment) => {
        const orderedList = appendElement(fragment, 'orderedList', { start: '1' });
        appendText(appendElement(appendElement(orderedList, 'listItem'), 'paragraph'), 'Item');
      }),
      createState((fragment) => {
        const orderedList = appendElement(fragment, 'orderedList', { type: 1 });
        appendText(appendElement(appendElement(orderedList, 'listItem'), 'paragraph'), 'Item');
      }),
      createState((fragment) => {
        const paragraph = appendElement(fragment, 'paragraph');
        appendText(paragraph, 'Unsafe link', { link: { href: 'javascript:alert(1)' } });
      }),
      createState((fragment) => {
        const paragraph = appendElement(fragment, 'paragraph');
        appendText(paragraph, 'Wrong href type', { link: { href: 42 } });
      }),
    ];

    for (const yjsState of cases) {
      expectProjectionError(
        () => projectDocument({ yjsState, tiptapSchemaVersion: 1 }),
        'unsupported_content',
      );
    }
  });

  it('accepts orderedList.start safe integer boundaries without imposing a positive range', () => {
    for (const start of [Number.MIN_SAFE_INTEGER, -1, 0, Number.MAX_SAFE_INTEGER]) {
      const yjsState = createState((fragment) => {
        const orderedList = appendElement(fragment, 'orderedList', { start });
        appendText(appendElement(appendElement(orderedList, 'listItem'), 'paragraph'), 'Item');
      });

      const projection = projectDocument({ yjsState, tiptapSchemaVersion: 1 });
      expect(projection.contentJson.content?.[0]?.attrs?.start).toBe(start);
    }
  });

  it('rejects non-integer and unsafe orderedList.start values', () => {
    for (const start of [
      -2.5,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MIN_SAFE_INTEGER - 1,
    ]) {
      const yjsState = createState((fragment) => {
        const orderedList = appendElement(fragment, 'orderedList', { start });
        appendText(appendElement(appendElement(orderedList, 'listItem'), 'paragraph'), 'Item');
      });

      expectProjectionError(
        () => projectDocument({ yjsState, tiptapSchemaVersion: 1 }),
        'unsupported_content',
      );
    }
  });

  it('canonicalizes link href without mutating captured bytes', () => {
    const yjsState = createState((fragment) => {
      const paragraph = appendElement(fragment, 'paragraph');
      appendText(paragraph, 'Canonical link', { link: { href: '  example.com/path  ' } });
    });
    const capturedBytes = Uint8Array.from(yjsState);

    const projection = projectDocument({ yjsState, tiptapSchemaVersion: 1 });

    expect(projection.contentJson.content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.href).toBe(
      'https://example.com/path',
    );
    expect(yjsState).toEqual(capturedBytes);
  });

  it('keeps one external reference per image occurrence and only references images', () => {
    const yjsState = createState((fragment) => {
      appendElement(fragment, 'image', {
        ...mediaAttrs(IMAGE_ID, 'https://example.com/photo.jpg'),
        alt: 'Photo',
        decorative: false,
      });
      appendElement(fragment, 'video', mediaAttrs(VIDEO_ID, 'https://example.com/clip.mp4'));
      appendElement(fragment, 'youtube', {
        nodeId: YOUTUBE_ID,
        videoId: 'dQw4w9WgXcQ',
        alignment: 'end',
        widthPercent: 70,
        caption: null,
      });
      appendElement(fragment, 'image', {
        ...mediaAttrs('44444444-4444-4444-8444-444444444444', 'https://example.com/photo.jpg'),
        alt: 'Same URL, different occurrence',
        decorative: false,
      });
    });

    const projection = projectDocument({ yjsState, tiptapSchemaVersion: 1 });
    expect(projection.mediaReferences).toEqual([
      { type: 'external', nodeId: IMAGE_ID, url: 'https://example.com/photo.jpg' },
      {
        type: 'external',
        nodeId: '44444444-4444-4444-8444-444444444444',
        url: 'https://example.com/photo.jpg',
      },
    ]);
    expect(projection.contentJson.content?.map(({ type }) => type)).toEqual([
      'image',
      'video',
      'youtube',
      'image',
    ]);
  });

  it('normalizes accepted media attrs consistently in JSON and image references', () => {
    const yjsState = createState((fragment) => {
      appendElement(fragment, 'image', {
        ...mediaAttrs(IMAGE_ID, '  example.com/photo.jpg  '),
        alignment: 'left',
        caption: '  View  ',
        widthPercent: 145,
        alt: '  Photo  ',
        decorative: false,
      });
      appendElement(fragment, 'video', {
        ...mediaAttrs(VIDEO_ID, ' video.example.com/clip.WEBM '),
        alignment: 'right',
        widthPercent: 24.4,
      });
      appendElement(fragment, 'youtube', {
        nodeId: YOUTUBE_ID,
        videoId: 'dQw4w9WgXcQ',
        alignment: 'end',
        widthPercent: 140,
        caption: '  Clip  ',
      });
    });

    const projection = projectDocument({ yjsState, tiptapSchemaVersion: 1 });
    const [image, video, youtube] = projection.contentJson.content ?? [];
    expect(image?.attrs).toMatchObject({
      alignment: 'center',
      alt: 'Photo',
      caption: 'View',
      decorative: false,
      nodeId: IMAGE_ID,
      src: 'https://example.com/photo.jpg',
      widthPercent: 100,
    });
    expect(video?.attrs).toMatchObject({
      alignment: 'center',
      src: 'https://video.example.com/clip.WEBM',
      widthPercent: 25,
    });
    expect(youtube?.attrs).toMatchObject({
      alignment: 'end',
      caption: 'Clip',
      videoId: 'dQw4w9WgXcQ',
      widthPercent: 100,
    });
    expect(projection.mediaReferences).toEqual([
      { type: 'external', nodeId: image?.attrs?.nodeId, url: image?.attrs?.src },
    ]);
    const imageReference = projection.mediaReferences[0];
    expect(imageReference?.type).toBe('external');
    if (imageReference?.type === 'external') {
      expect(imageReference.url).toBe(image?.attrs?.src);
    }
  });

  it('rejects non-HTTPS or invalid media attrs without returning partial output', () => {
    const cases = [
      createState((fragment) =>
        appendElement(fragment, 'image', {
          ...mediaAttrs(IMAGE_ID, 'http://example.com/photo.jpg'),
          alt: 'Photo',
          decorative: false,
        }),
      ),
      createState((fragment) =>
        appendElement(fragment, 'image', {
          ...mediaAttrs(IMAGE_ID, 'javascript:alert(1)'),
          alt: 'Photo',
          decorative: false,
        }),
      ),
      createState((fragment) =>
        appendElement(fragment, 'image', {
          ...mediaAttrs(IMAGE_ID, 'https://user:pass@example.com/photo.jpg'),
          alt: 'Photo',
          decorative: false,
        }),
      ),
      createState((fragment) =>
        appendElement(fragment, 'video', mediaAttrs(VIDEO_ID, 'https://example.com/clip.mov')),
      ),
      createState((fragment) =>
        appendElement(fragment, 'youtube', {
          nodeId: YOUTUBE_ID,
          videoId: 'too-short',
        }),
      ),
      createState((fragment) =>
        appendElement(fragment, 'image', {
          ...mediaAttrs(IMAGE_ID, 'https://example.com/photo.jpg'),
          alt: 'Not empty',
          decorative: true,
        }),
      ),
    ];

    for (const yjsState of cases) {
      expectProjectionError(
        () => projectDocument({ yjsState, tiptapSchemaVersion: 1 }),
        'invalid_media_attributes',
      );
    }
  });

  it('rejects missing and duplicate media node ids without generating replacements', () => {
    const missingId = createState((fragment) =>
      appendElement(fragment, 'image', {
        src: 'https://example.com/photo.jpg',
        alt: 'Photo',
        decorative: false,
      }),
    );
    const duplicateId = createState((fragment) => {
      appendElement(fragment, 'image', {
        ...mediaAttrs(IMAGE_ID, 'https://example.com/photo.jpg'),
        alt: 'Photo',
        decorative: false,
      });
      appendElement(fragment, 'video', mediaAttrs(IMAGE_ID, 'https://example.com/clip.mp4'));
    });

    expectProjectionError(
      () => projectDocument({ yjsState: missingId, tiptapSchemaVersion: 1 }),
      'invalid_media_attributes',
    );
    expectProjectionError(
      () => projectDocument({ yjsState: duplicateId, tiptapSchemaVersion: 1 }),
      'invalid_media_attributes',
    );
  });

  it('decodes y-prosemirror hash-suffixed mark names and preserves concurrent marks', () => {
    const yjsState = createState((fragment) => {
      const paragraph = appendElement(fragment, 'paragraph');
      appendText(paragraph, 'hashed', {
        'bold--AAAAAAAA': {},
        italic: {},
        link: { href: 'https://example.com/hashed' },
      });
    });

    expect(projectDocument({ yjsState, tiptapSchemaVersion: 1 }).contentJson).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'hashed',
              marks: [
                { type: 'link', attrs: { href: 'https://example.com/hashed' } },
                { type: 'bold' },
                { type: 'italic' },
              ],
            },
          ],
        },
      ],
    });
  });

  it('fails closed when hash decoding collides on a mark type with different attrs', () => {
    const yjsState = createState((fragment) => {
      const paragraph = appendElement(fragment, 'paragraph');
      appendText(paragraph, 'collision', {
        'link--AAAAAAAA': { href: 'https://example.com/one' },
        'link--BBBBBBBB': { href: 'https://example.com/two' },
      });
    });

    expectProjectionError(
      () => projectDocument({ yjsState, tiptapSchemaVersion: 1 }),
      'unsupported_content',
    );
  });

  it('fails closed for unsupported nodes, marks, attrs, and structures', () => {
    const states = [
      createState((fragment) => appendElement(fragment, 'unsupportedNode')),
      createState((fragment) => {
        const paragraph = appendElement(fragment, 'paragraph');
        appendText(paragraph, 'unsupported', { underline: {} });
      }),
      createState((fragment) => {
        appendElement(fragment, 'image', {
          ...mediaAttrs(IMAGE_ID, 'https://example.com/photo.jpg'),
          alt: 'Photo',
          decorative: false,
          assetId: 'unrecognized',
        });
      }),
      createState((fragment) => appendElement(fragment, 'taskItem')),
    ];

    for (const yjsState of states) {
      expectProjectionError(
        () => projectDocument({ yjsState, tiptapSchemaVersion: 1 }),
        'unsupported_content',
      );
    }
  });

  it('fails closed for prototype-sensitive and unknown attribute names', () => {
    const prototypeAttr = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(prototypeAttr, '__proto__', {
      enumerable: true,
      value: 'must not disappear',
    });
    const states = [
      createState((fragment) => appendElement(fragment, 'paragraph', prototypeAttr)),
      createState((fragment) => appendElement(fragment, 'paragraph', { constructor: 'unknown' })),
      createState((fragment) => appendElement(fragment, 'paragraph', { prototype: 'unknown' })),
    ];

    for (const yjsState of states) {
      expectProjectionError(
        () => projectDocument({ yjsState, tiptapSchemaVersion: 1 }),
        'unsupported_content',
      );
    }
  });

  it('rejects malformed Yjs updates and unknown schema versions explicitly', () => {
    expectProjectionError(
      () => projectDocument({ yjsState: Uint8Array.from([255, 255, 255]), tiptapSchemaVersion: 1 }),
      'invalid_yjs_state',
    );
    expectProjectionError(
      () => projectDocument({ yjsState: new Uint8Array(), tiptapSchemaVersion: 2 }),
      'unsupported_schema_version',
    );
  });

  it('uses captured bytes only and does not mutate them or follow later live edits', () => {
    const liveDocument = new Y.Doc();
    const paragraph = appendElement(liveDocument.getXmlFragment('default'), 'paragraph');
    appendText(paragraph, 'captured');
    const capturedState = Y.encodeStateAsUpdate(liveDocument);
    const before = capturedState.slice();

    const firstProjection = projectDocument({ yjsState: capturedState, tiptapSchemaVersion: 1 });
    appendText(paragraph, ' changed later');
    const secondProjection = projectDocument({ yjsState: capturedState, tiptapSchemaVersion: 1 });
    liveDocument.destroy();

    expect(capturedState).toEqual(before);
    expect(secondProjection).toEqual(firstProjection);
    expect(secondProjection.contentJson.content?.[0]?.content?.[0]?.text).toBe('captured');
  });
});
