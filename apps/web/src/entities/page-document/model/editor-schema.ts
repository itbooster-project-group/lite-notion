import { type Extensions, getSchema, Node } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import Link from '@tiptap/extension-link';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import type { Doc as YDoc } from 'yjs';

import {
  clampPageDocumentWidthPercent,
  normalizePageDocumentLink,
  normalizePersistedPageDocumentImageAttributes,
  normalizePersistedPageDocumentVideoAttributes,
  normalizePersistedPageDocumentYoutubeAttributes,
  PAGE_DOCUMENT_MAX_WIDTH_PERCENT,
} from '../lib/media-validation';
import { PageDocumentNodeIdDeconflict } from './node-id-deconflict';
import { PAGE_CONTENT_YJS_FIELD } from './schema-version';

const sharedMediaAttributes = {
  alignment: {
    default: 'center',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-alignment') ?? 'center',
    rendered: false,
  },
  caption: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.querySelector('figcaption')?.textContent?.trim() || null,
    rendered: false,
  },
  nodeId: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-node-id'),
    rendered: false,
  },
  widthPercent: {
    default: PAGE_DOCUMENT_MAX_WIDTH_PERCENT,
    parseHTML: (element: HTMLElement) =>
      clampPageDocumentWidthPercent(Number(element.getAttribute('data-width-percent'))),
    rendered: false,
  },
};

function mediaFigureAttributes(
  nodeType: string,
  attrs: Readonly<{ alignment: unknown; nodeId: unknown; widthPercent: unknown }>,
) {
  const widthPercent = clampPageDocumentWidthPercent(Number(attrs.widthPercent));
  const alignment =
    attrs.alignment === 'start' || attrs.alignment === 'end' ? attrs.alignment : 'center';
  const margins = {
    center: 'margin-inline-start:auto;margin-inline-end:auto',
    end: 'margin-inline-start:auto;margin-inline-end:0',
    start: 'margin-inline-start:0;margin-inline-end:auto',
  } as const;

  return {
    'data-alignment': alignment,
    'data-node-id': String(attrs.nodeId ?? ''),
    'data-page-document-node': nodeType,
    'data-width-percent': String(widthPercent),
    style: `width:${widthPercent}%;${margins[alignment]}`,
  };
}

function invalidMediaOutput(nodeType: string): DOMOutputSpec {
  return [
    'figure',
    {
      'data-page-document-invalid': 'true',
      'data-page-document-node': nodeType,
    },
  ];
}

function captionOutput(caption: unknown) {
  return typeof caption === 'string' && caption ? ['figcaption', {}, caption] : undefined;
}

export const PageDocumentImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      ...sharedMediaAttributes,
      alt: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.querySelector('img')?.getAttribute('alt') ?? '',
        rendered: false,
      },
      decorative: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-decorative') === 'true',
        rendered: false,
      },
      src: {
        default: null,
        parseHTML: (element: HTMLElement) => element.querySelector('img')?.getAttribute('src'),
        rendered: false,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-page-document-node="image"]' }];
  },
  renderHTML({ node }) {
    const attrs = normalizePersistedPageDocumentImageAttributes(node.attrs);
    if (!attrs) return invalidMediaOutput('image');
    const { alt, caption, decorative, src } = attrs;
    const image = [
      'img',
      {
        alt: decorative ? '' : String(alt ?? ''),
        referrerpolicy: 'no-referrer',
        role: decorative ? 'presentation' : undefined,
        src: String(src ?? ''),
      },
    ];
    const renderedCaption = captionOutput(caption);

    return renderedCaption
      ? [
          'figure',
          {
            ...mediaFigureAttributes('image', attrs),
            'data-decorative': String(Boolean(decorative)),
          },
          image,
          renderedCaption,
        ]
      : [
          'figure',
          {
            ...mediaFigureAttributes('image', attrs),
            'data-decorative': String(Boolean(decorative)),
          },
          image,
        ];
  },
});

export const PageDocumentYoutube = Node.create({
  name: 'youtube',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      ...sharedMediaAttributes,
      videoId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-video-id'),
        rendered: false,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-page-document-node="youtube"]' }];
  },
  renderHTML({ node }) {
    const attrs = normalizePersistedPageDocumentYoutubeAttributes(node.attrs);
    if (!attrs) return invalidMediaOutput('youtube');
    const { caption, videoId } = attrs;
    const renderedCaption = captionOutput(caption);
    const iframe = [
      'iframe',
      {
        allow:
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        allowfullscreen: '',
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
        src: `https://www.youtube-nocookie.com/embed/${String(videoId ?? '')}`,
        title: typeof caption === 'string' && caption ? caption : 'YouTube video',
      },
    ];
    const figureAttributes = {
      ...mediaFigureAttributes('youtube', attrs),
      'data-video-id': String(videoId ?? ''),
    };

    return renderedCaption
      ? ['figure', figureAttributes, iframe, renderedCaption]
      : ['figure', figureAttributes, iframe];
  },
});

export const PageDocumentVideo = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      ...sharedMediaAttributes,
      src: {
        default: null,
        parseHTML: (element: HTMLElement) => element.querySelector('video')?.getAttribute('src'),
        rendered: false,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-page-document-node="video"]' }];
  },
  renderHTML({ node }) {
    const attrs = normalizePersistedPageDocumentVideoAttributes(node.attrs);
    if (!attrs) return invalidMediaOutput('video');
    const { caption, src } = attrs;
    const renderedCaption = captionOutput(caption);
    const video = [
      'video',
      {
        controls: '',
        preload: 'metadata',
        src: String(src ?? ''),
      },
      'Видео недоступно',
    ];

    return renderedCaption
      ? ['figure', mediaFigureAttributes('video', attrs), video, renderedCaption]
      : ['figure', mediaFigureAttributes('video', attrs), video];
  },
});

const PageDocumentLink = Link.extend({
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          normalizePageDocumentLink(element.getAttribute('href') ?? '') ?? null,
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const href =
      typeof HTMLAttributes.href === 'string'
        ? normalizePageDocumentLink(HTMLAttributes.href)
        : undefined;

    if (!href) return ['span', {}, 0];

    return href.startsWith('http:') || href.startsWith('https:')
      ? ['a', { href, rel: 'noopener noreferrer', target: '_blank' }, 0]
      : ['a', { href }, 0];
  },
}).configure({
  autolink: true,
  defaultProtocol: 'https',
  enableClickSelection: true,
  HTMLAttributes: {
    rel: 'noopener noreferrer',
    target: '_blank',
  },
  isAllowedUri: (url, { defaultValidate }) =>
    defaultValidate(url) && normalizePageDocumentLink(url) !== undefined,
  linkOnPaste: true,
  openOnClick: false,
  shouldAutoLink: (url) => normalizePageDocumentLink(url) !== undefined,
});

export function createPageDocumentSchemaExtensions(): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      horizontalRule: false,
      link: false,
      trailingNode: false,
      underline: false,
      undoRedo: false,
    }),
    PageDocumentLink,
    TaskList,
    TaskItem.configure({ nested: true }),
    PageDocumentImage,
    PageDocumentYoutube,
    PageDocumentVideo,
  ];
}

export function createPageDocumentEditorExtensions(document: YDoc): Extensions {
  return [
    ...createPageDocumentSchemaExtensions(),
    PageDocumentNodeIdDeconflict,
    Collaboration.configure({
      document,
      field: PAGE_CONTENT_YJS_FIELD,
    }),
  ];
}

export function getPageDocumentSchema() {
  return getSchema(createPageDocumentSchemaExtensions());
}
