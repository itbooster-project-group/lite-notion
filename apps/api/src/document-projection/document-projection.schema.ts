import { Schema } from '@tiptap/pm/model';

const mediaPresentationAttrs = {
  alignment: { default: 'center' },
  caption: { default: null },
  nodeId: { default: null },
  widthPercent: { default: 100 },
};

export const DOCUMENT_PROJECTION_SCHEMA_VERSION = 2;
export const DOCUMENT_PROJECTION_YJS_FIELD = 'default';

export const documentProjectionSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: {
      content: 'inline*',
      group: 'block',
      defining: true,
      attrs: { level: { default: 1 } },
    },
    bulletList: { content: 'listItem+', group: 'block list' },
    orderedList: {
      content: 'listItem+',
      group: 'block list',
      attrs: { start: { default: 1 }, type: { default: null } },
    },
    listItem: { content: 'paragraph block*', defining: true },
    taskList: { content: 'taskItem+', group: 'block list' },
    taskItem: {
      content: 'paragraph block*',
      defining: true,
      attrs: { checked: { default: false } },
    },
    hardBreak: {
      group: 'inline',
      inline: true,
      selectable: false,
      linebreakReplacement: true,
    },
    image: {
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      attrs: {
        ...mediaPresentationAttrs,
        alt: { default: '' },
        decorative: { default: false },
        src: { default: null },
        source: { default: null },
      },
    },
    video: {
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      attrs: { ...mediaPresentationAttrs, src: { default: null } },
    },
    youtube: {
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      attrs: { ...mediaPresentationAttrs, videoId: { default: null } },
    },
    text: { group: 'inline' },
  },
  marks: {
    link: { attrs: { href: { default: null } }, inclusive: true },
    bold: {},
    code: { excludes: '_', code: true },
    italic: {},
    strike: {},
  },
});
