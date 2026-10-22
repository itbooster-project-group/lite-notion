import { describe, expect, it } from 'vitest';
import type {
  ProseMirrorJSONContent,
  ProseMirrorMarkJSON,
} from '../../document-projection/document-projection';
import { extractSearchableText } from './search-text-extractor';

function node(
  type: string,
  options: {
    attrs?: Record<string, string | number | boolean | null>;
    content?: ProseMirrorJSONContent[];
    marks?: readonly ProseMirrorMarkJSON[];
    text?: string;
  } = {},
): ProseMirrorJSONContent {
  return { type, ...options };
}

describe('extractSearchableText', () => {
  it('keeps text in reading order with block separators and ignores formatting marks', () => {
    const content = node('doc', {
      content: [
        node('heading', { attrs: { level: 1 }, content: [node('text', { text: 'Title' })] }),
        node('paragraph', {
          content: [
            node('text', { marks: [{ type: 'bold' }], text: 'bold ' }),
            node('text', { text: 'and italic' }),
            node('hardBreak'),
            node('text', { text: 'next line' }),
          ],
        }),
        node('bulletList', {
          content: [
            node('listItem', {
              content: [node('paragraph', { content: [node('text', { text: 'First item' })] })],
            }),
            node('listItem', {
              content: [node('paragraph', { content: [node('text', { text: 'Second item' })] })],
            }),
          ],
        }),
        node('taskList', {
          content: [
            node('taskItem', {
              attrs: { checked: true },
              content: [node('paragraph', { content: [node('text', { text: 'Completed task' })] })],
            }),
          ],
        }),
      ],
    });

    expect(extractSearchableText(content)).toBe(
      'Title\nbold and italic\nnext line\nFirst item\nSecond item\nCompleted task',
    );
  });

  it('includes user-visible media captions and alt text but not technical attributes', () => {
    const content = node('doc', {
      content: [
        node('image', {
          attrs: {
            alignment: 'center',
            alt: 'A lighthouse',
            caption: 'Coastal view',
            nodeId: 'internal-node',
            source: 'private-asset',
            src: 'https://files.example/private.jpg',
            widthPercent: 80,
          },
        }),
        node('video', {
          attrs: {
            caption: 'Product demo',
            nodeId: 'internal-video',
            src: 'https://files.example/demo.mp4',
          },
        }),
        node('youtube', {
          attrs: {
            caption: 'Walkthrough',
            nodeId: 'internal-youtube',
            videoId: 'private-video-id',
          },
        }),
      ],
    });

    const text = extractSearchableText(content);
    expect(text).toContain('A lighthouse Coastal view');
    expect(text).toContain('Product demo');
    expect(text).toContain('Walkthrough');
    expect(text).not.toMatch(/internal-|private|https?:/);
  });

  it('returns empty text for an empty document and drops blank captions', () => {
    expect(extractSearchableText(node('doc'))).toBe('');
    expect(
      extractSearchableText(
        node('doc', { content: [node('image', { attrs: { alt: '', caption: '  ' } })] }),
      ),
    ).toBe('');
  });
});
