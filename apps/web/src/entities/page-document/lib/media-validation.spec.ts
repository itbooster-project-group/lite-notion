import { describe, expect, it } from 'vitest';

import {
  clampPageDocumentWidthPercent,
  createPageDocumentImageAttributes,
  createPageDocumentVideoAttributes,
  createPageDocumentYoutubeAttributes,
  isPageDocumentNodeId,
  normalizePageDocumentImageUrl,
  normalizePageDocumentLink,
  normalizePageDocumentVideoUrl,
  normalizePageDocumentYoutubeVideoId,
} from './media-validation';

const NODE_ID = '11111111-1111-4111-8111-111111111111';

describe('page document URL validation', () => {
  it('нормализует только разрешённые ссылки', () => {
    expect(normalizePageDocumentLink('example.com/docs')).toBe('https://example.com/docs');
    expect(normalizePageDocumentLink('http://example.com')).toBe('http://example.com/');
    expect(normalizePageDocumentLink('mailto:editor@example.com')).toBe(
      'mailto:editor@example.com',
    );
    expect(normalizePageDocumentLink('javascript:alert(1)')).toBeUndefined();
    expect(normalizePageDocumentLink('data:text/plain,unsafe')).toBeUndefined();
  });

  it('принимает external image только по HTTPS без credentials', () => {
    expect(normalizePageDocumentImageUrl('example.com/photo.jpg')).toBe(
      'https://example.com/photo.jpg',
    );
    expect(normalizePageDocumentImageUrl('http://example.com/photo.jpg')).toBeUndefined();
    expect(
      normalizePageDocumentImageUrl('https://user:secret@example.com/photo.jpg'),
    ).toBeUndefined();
  });

  it('нормализует allowlisted YouTube URL до video ID', () => {
    expect(normalizePageDocumentYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(
      normalizePageDocumentYoutubeVideoId(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
      ),
    ).toBe('dQw4w9WgXcQ');
    expect(
      normalizePageDocumentYoutubeVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
    expect(normalizePageDocumentYoutubeVideoId('https://vimeo.com/123')).toBeUndefined();
  });

  it('принимает direct video только MP4/WebM по HTTPS', () => {
    expect(normalizePageDocumentVideoUrl('https://example.com/demo.MP4?token=1')).toBe(
      'https://example.com/demo.MP4?token=1',
    );
    expect(normalizePageDocumentVideoUrl('https://example.com/demo.webm')).toBe(
      'https://example.com/demo.webm',
    );
    expect(normalizePageDocumentVideoUrl('https://example.com/demo.mov')).toBeUndefined();
    expect(normalizePageDocumentVideoUrl('blob:https://example.com/id')).toBeUndefined();
  });
});

describe('page document media attributes', () => {
  it('создаёт stable image attrs и нормализует presentation values', () => {
    expect(
      createPageDocumentImageAttributes(
        {
          alignment: 'start',
          alt: ' Горы ',
          caption: ' Поход ',
          decorative: false,
          src: 'example.com/mountains.jpg',
          widthPercent: 67.6,
        },
        () => NODE_ID,
      ),
    ).toEqual({
      alignment: 'start',
      alt: 'Горы',
      caption: 'Поход',
      decorative: false,
      nodeId: NODE_ID,
      src: 'https://example.com/mountains.jpg',
      widthPercent: 68,
    });
  });

  it('отклоняет inconsistent image accessibility attrs', () => {
    expect(
      createPageDocumentImageAttributes(
        { alt: '', decorative: false, src: 'https://example.com/photo.jpg' },
        () => NODE_ID,
      ),
    ).toBeUndefined();
    expect(
      createPageDocumentImageAttributes(
        { alt: 'Описание', decorative: true, src: 'https://example.com/photo.jpg' },
        () => NODE_ID,
      ),
    ).toBeUndefined();
  });

  it('создаёт YouTube/video attrs без сохранения исходного embed HTML', () => {
    expect(
      createPageDocumentYoutubeAttributes(
        { url: 'https://youtu.be/dQw4w9WgXcQ', widthPercent: 75 },
        () => NODE_ID,
      ),
    ).toEqual({
      alignment: 'center',
      caption: null,
      nodeId: NODE_ID,
      videoId: 'dQw4w9WgXcQ',
      widthPercent: 75,
    });
    expect(
      createPageDocumentVideoAttributes({ src: 'https://example.com/demo.webm' }, () => NODE_ID),
    ).toEqual({
      alignment: 'center',
      caption: null,
      nodeId: NODE_ID,
      src: 'https://example.com/demo.webm',
      widthPercent: 100,
    });
  });

  it('ограничивает widthPercent и проверяет UUID nodeId', () => {
    expect(clampPageDocumentWidthPercent(12)).toBe(25);
    expect(clampPageDocumentWidthPercent(140)).toBe(100);
    expect(clampPageDocumentWidthPercent(Number.NaN)).toBe(100);
    expect(isPageDocumentNodeId(NODE_ID)).toBe(true);
    expect(isPageDocumentNodeId('media-1')).toBe(false);
  });
});
