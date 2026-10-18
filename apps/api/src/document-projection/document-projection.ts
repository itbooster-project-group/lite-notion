import { isDeepStrictEqual } from 'node:util';
import { type Mark as ProseMirrorMark } from '@tiptap/pm/model';
import * as Y from 'yjs';

import { DocumentProjectionError } from './document-projection.errors';
import {
  DOCUMENT_PROJECTION_SCHEMA_VERSION,
  DOCUMENT_PROJECTION_YJS_FIELD,
  documentProjectionSchema,
} from './document-projection.schema';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type JsonObject = Readonly<Record<string, JsonValue>>;

export type ProseMirrorMarkJSON = Readonly<{
  type: string;
  attrs?: JsonObject;
}>;

export type ProseMirrorJSONContent = Readonly<{
  type: string;
  attrs?: JsonObject;
  content?: readonly ProseMirrorJSONContent[];
  marks?: readonly ProseMirrorMarkJSON[];
  text?: string;
}>;

export type ImageSource =
  | Readonly<{ type: 'external'; url: string }>
  | Readonly<{ type: 'asset'; assetId: string }>;

export type MediaReference =
  | Readonly<{ type: 'external'; nodeId: string; url: string }>
  | Readonly<{ type: 'asset'; nodeId: string; assetId: string }>;

export type DocumentProjection = Readonly<{
  contentJson: ProseMirrorJSONContent;
  mediaReferences: readonly MediaReference[];
  schemaVersion: number;
}>;

export type ProjectDocumentInput = Readonly<{
  yjsState: Uint8Array;
  tiptapSchemaVersion: number;
}>;

const MEDIA_NODE_TYPES = new Set(['image', 'video', 'youtube']);
const MEDIA_ALIGNMENTS = new Set(['start', 'center', 'end']);
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const HASHED_MARK_NAME_PATTERN = /(.*)(--[a-zA-Z0-9+/=]{8})$/;
const MARK_ORDER = new Map(
  Object.keys(documentProjectionSchema.marks).map((name, index) => [name, index]),
);

function compareMarkOrder(left: ProseMirrorMarkJSON, right: ProseMirrorMarkJSON): number {
  const leftOrder = MARK_ORDER.get(left.type);
  const rightOrder = MARK_ORDER.get(right.type);
  if (leftOrder === undefined || rightOrder === undefined) {
    throw invalidContent('Cannot order an unsupported mark.');
  }
  return leftOrder - rightOrder;
}

function invalidContent(message: string, cause?: unknown): DocumentProjectionError {
  return new DocumentProjectionError('unsupported_content', message, { cause });
}

function invalidMedia(message: string): DocumentProjectionError {
  return new DocumentProjectionError('invalid_media_attributes', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown, seen = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalidContent('Yjs content contains a non-finite number.');
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw invalidContent('Yjs content contains a non-JSON value.');
  }

  if (seen.has(value)) {
    throw invalidContent('Yjs content contains a cyclic value.');
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => toJsonValue(item, seen));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidContent('Yjs content contains a non-plain object.');
    }

    const result = Object.create(null) as Record<string, JsonValue>;
    for (const [key, item] of Object.entries(value)) {
      result[key] = toJsonValue(item, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function normalizePageDocumentLink(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (!ALLOWED_LINK_PROTOCOLS.has(url.protocol)) return undefined;
    if (url.protocol === 'mailto:') return url.pathname ? url.href : undefined;
    return url.hostname && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function validatePersistedNodeAttrs(
  type: string,
  attrs: Readonly<Record<string, JsonValue>>,
): void {
  if (type === 'heading' && attrs.level !== undefined) {
    if (typeof attrs.level !== 'number' || ![1, 2, 3].includes(attrs.level)) {
      throw invalidContent('heading node has an invalid level.');
    }
  }

  if (type === 'taskItem' && attrs.checked !== undefined && typeof attrs.checked !== 'boolean') {
    throw invalidContent('taskItem node has an invalid checked attr.');
  }

  if (type === 'orderedList') {
    if (attrs.start !== undefined && !Number.isSafeInteger(attrs.start)) {
      throw invalidContent('orderedList node has an invalid start attr.');
    }
    if (attrs.type !== undefined && attrs.type !== null && typeof attrs.type !== 'string') {
      throw invalidContent('orderedList node has an invalid type attr.');
    }
  }
}

function toJsonObject(value: unknown, label: string): Record<string, JsonValue> {
  if (!isRecord(value)) {
    throw invalidContent(`${label} must be a JSON object.`);
  }

  const json = toJsonValue(value);
  if (!isRecord(json)) {
    throw invalidContent(`${label} must be a JSON object.`);
  }
  return json;
}

function assertKnownKeys(
  object: Readonly<Record<string, unknown>>,
  allowedKeys: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw invalidContent(`${label} contains unsupported key "${key}".`);
    }
  }
}

function normalizeHttpsUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function normalizeCaption(value: unknown): string | null {
  const caption = typeof value === 'string' ? value.trim() : '';
  return caption || null;
}

function normalizeAlignment(value: unknown): 'start' | 'center' | 'end' {
  return typeof value === 'string' && MEDIA_ALIGNMENTS.has(value)
    ? (value as 'start' | 'center' | 'end')
    : 'center';
}

function normalizeWidthPercent(value: unknown): number {
  const width = Number(value);
  if (!Number.isFinite(width)) return 100;
  return Math.min(100, Math.max(25, Math.round(width)));
}

function normalizedPresentationAttrs(attrs: Readonly<Record<string, unknown>>) {
  return {
    alignment: normalizeAlignment(attrs.alignment),
    caption: normalizeCaption(attrs.caption),
    widthPercent: normalizeWidthPercent(attrs.widthPercent),
  };
}

function normalizeMediaAttrs(
  type: string,
  attrs: Readonly<Record<string, JsonValue>>,
  schemaVersion: number,
): Record<string, JsonValue> {
  if (typeof attrs.nodeId !== 'string' || !UUID_PATTERN.test(attrs.nodeId)) {
    throw invalidMedia(`${type} node has a missing or invalid nodeId.`);
  }

  const presentation = normalizedPresentationAttrs(attrs);
  const normalized: Record<string, JsonValue> = {
    ...presentation,
    nodeId: attrs.nodeId,
  };

  if (type === 'image') {
    if (schemaVersion >= 2 && attrs.source !== undefined && attrs.source !== null) {
      const source = attrs.source;
      if (
        !isRecord(source) ||
        source.type !== 'asset' ||
        typeof source.assetId !== 'string' ||
        !UUID_PATTERN.test(source.assetId)
      ) {
        throw invalidMedia('image node has an invalid asset source.');
      }
      const decorative = attrs.decorative === true;
      const alt = typeof attrs.alt === 'string' ? attrs.alt.trim() : '';
      if (decorative ? alt.length > 0 : alt.length === 0) {
        throw invalidMedia('image node has incompatible alt and decorative attrs.');
      }
      return {
        ...normalized,
        alt,
        decorative,
        source: toJsonObject({ type: 'asset', assetId: source.assetId }, 'image source'),
      };
    }
    if (typeof attrs.src !== 'string') {
      throw invalidMedia('image node has a missing or invalid src.');
    }
    const src = normalizeHttpsUrl(attrs.src);
    if (!src) throw invalidMedia('image node has an invalid external URL.');

    const decorative = attrs.decorative === true;
    const alt = typeof attrs.alt === 'string' ? attrs.alt.trim() : '';
    if (decorative ? alt.length > 0 : alt.length === 0) {
      throw invalidMedia('image node has incompatible alt and decorative attrs.');
    }

    return { ...normalized, alt, decorative, src };
  }

  if (type === 'video') {
    if (typeof attrs.src !== 'string') {
      throw invalidMedia('video node has a missing or invalid src.');
    }
    const src = normalizeHttpsUrl(attrs.src);
    if (!src || !/\.(mp4|webm)$/i.test(new URL(src).pathname)) {
      throw invalidMedia('video node has an invalid external video URL.');
    }
    return { ...normalized, src };
  }

  if (typeof attrs.videoId !== 'string' || !YOUTUBE_VIDEO_ID_PATTERN.test(attrs.videoId)) {
    throw invalidMedia('youtube node has a missing or invalid videoId.');
  }
  return { ...normalized, videoId: attrs.videoId };
}

function markNameFromYjsAttribute(name: string): string {
  return HASHED_MARK_NAME_PATTERN.exec(name)?.[1] ?? name;
}

function marksFromDeltaAttributes(attributes: unknown): readonly ProseMirrorMarkJSON[] {
  if (attributes === undefined) return [];
  if (!isRecord(attributes)) {
    throw invalidContent('Yjs text marks must be stored as an object.');
  }

  const marksByName = new Map<string, ProseMirrorMarkJSON>();
  for (const [encodedName, rawAttrs] of Object.entries(attributes)) {
    const name = markNameFromYjsAttribute(encodedName);
    const markType = documentProjectionSchema.marks[name];
    if (!markType) throw invalidContent(`Unsupported mark "${name}".`);

    const attrs = toJsonObject(rawAttrs, `Mark "${name}" attrs`);
    assertKnownKeys(attrs, new Set(Object.keys(markType.spec.attrs ?? {})), `Mark "${name}" attrs`);

    let markAttrs = attrs;
    if (name === 'link') {
      if (typeof attrs.href !== 'string') {
        throw invalidContent('link mark has a missing or invalid href.');
      }
      const href = normalizePageDocumentLink(attrs.href);
      if (!href) throw invalidContent('link mark has an invalid href.');
      markAttrs = { ...attrs, href };
    }

    let mark: ProseMirrorMark;
    try {
      mark = markType.create(markAttrs);
    } catch (error) {
      throw invalidContent(`Mark "${name}" has invalid attrs.`, error);
    }

    const normalizedAttrs = toJsonObject(mark.attrs, `Mark "${name}" attrs`);
    const markJson: ProseMirrorMarkJSON = Object.keys(normalizedAttrs).length
      ? { type: name, attrs: normalizedAttrs }
      : { type: name };
    const previous = marksByName.get(name);
    if (previous && JSON.stringify(previous) !== JSON.stringify(markJson)) {
      throw invalidContent(`Yjs marks with base name "${name}" have conflicting attrs.`);
    }
    marksByName.set(name, markJson);
  }

  return [...marksByName.values()].sort(compareMarkOrder);
}

function serializeXmlText(text: Y.XmlText): ProseMirrorJSONContent[] {
  const result: ProseMirrorJSONContent[] = [];
  for (const operation of text.toDelta()) {
    if (typeof operation.insert !== 'string') {
      throw invalidContent('Yjs text contains an unsupported embedded value.');
    }
    if (operation.insert.length === 0) continue;

    const marks = marksFromDeltaAttributes(operation.attributes);
    result.push(
      marks.length
        ? { type: 'text', text: operation.insert, marks }
        : { type: 'text', text: operation.insert },
    );
  }
  return result;
}

function serializeXmlElement(
  element: Y.XmlElement,
  mediaNodeIds: Set<string>,
  mediaReferences: MediaReference[],
  schemaVersion: number,
): ProseMirrorJSONContent {
  const type = element.nodeName;
  if (type === 'text') {
    throw invalidContent('Y.XmlElement cannot represent a ProseMirror text node.');
  }

  const nodeType = documentProjectionSchema.nodes[type];
  if (!nodeType) throw invalidContent(`Unsupported node "${type}".`);

  if (element.hasAttribute('__proto__')) {
    throw invalidContent(`Node "${type}" contains unsupported key "__proto__".`);
  }
  const rawAttrs = toJsonObject(element.getAttributes(), `Node "${type}" attrs`);
  const allowedAttrs = new Set(Object.keys(nodeType.spec.attrs ?? {}));
  if (schemaVersion < 2 && type === 'image') allowedAttrs.delete('source');
  assertKnownKeys(rawAttrs, allowedAttrs, `Node "${type}" attrs`);
  validatePersistedNodeAttrs(type, rawAttrs);

  let attrs = rawAttrs;
  if (MEDIA_NODE_TYPES.has(type)) {
    attrs = normalizeMediaAttrs(type, rawAttrs, schemaVersion);
    const nodeId = attrs.nodeId as string;
    if (mediaNodeIds.has(nodeId)) {
      throw invalidMedia(`Media nodes contain a duplicate nodeId "${nodeId}".`);
    }
    mediaNodeIds.add(nodeId);

    if (type === 'image') {
      const source = attrs.source;
      if (isRecord(source) && source.type === 'asset' && typeof source.assetId === 'string') {
        mediaReferences.push({ type: 'asset', nodeId, assetId: source.assetId });
      } else {
        mediaReferences.push({ type: 'external', nodeId, url: attrs.src as string });
      }
    }
  }

  const content: ProseMirrorJSONContent[] = [];
  for (const child of element.toArray()) {
    if (child instanceof Y.XmlElement) {
      content.push(serializeXmlElement(child, mediaNodeIds, mediaReferences, schemaVersion));
    } else if (child instanceof Y.XmlText) {
      content.push(...serializeXmlText(child));
    } else {
      throw invalidContent(`Node "${type}" contains an unsupported Yjs XML child.`);
    }
  }

  const result: ProseMirrorJSONContent = {
    type,
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(content.length ? { content } : {}),
  };
  return result;
}

function normalizeJsonForComparison(node: ProseMirrorJSONContent): ProseMirrorJSONContent {
  if (node.type === 'text') {
    const text = node.text;
    if (typeof text !== 'string') throw invalidContent('Text node is missing text.');
    const marks = (node.marks ?? []).map((mark) => {
      const markType = documentProjectionSchema.marks[mark.type];
      if (!markType) throw invalidContent(`Unsupported mark "${mark.type}".`);
      const normalized = markType.create(mark.attrs ?? {});
      const attrs = toJsonObject(normalized.attrs, `Mark "${mark.type}" attrs`);
      return Object.keys(attrs).length ? { type: mark.type, attrs } : { type: mark.type };
    });
    marks.sort(compareMarkOrder);
    return { type: 'text', text, ...(marks.length ? { marks } : {}) };
  }

  const nodeType = documentProjectionSchema.nodes[node.type];
  if (!nodeType) throw invalidContent(`Unsupported node "${node.type}".`);
  const normalizedAttrs = toJsonObject(
    nodeType.create(node.attrs ?? {}).attrs,
    `Node "${node.type}" attrs`,
  );
  const children = (node.content ?? []).map(normalizeJsonForComparison);
  const mergedChildren: ProseMirrorJSONContent[] = [];
  for (const child of children) {
    const previous = mergedChildren.at(-1);
    if (
      previous?.type === 'text' &&
      child.type === 'text' &&
      JSON.stringify(previous.marks ?? []) === JSON.stringify(child.marks ?? [])
    ) {
      mergedChildren[mergedChildren.length - 1] = {
        type: 'text',
        text: `${previous.text ?? ''}${child.text ?? ''}`,
        ...(previous.marks?.length ? { marks: previous.marks } : {}),
      };
    } else {
      mergedChildren.push(child);
    }
  }

  return {
    type: node.type,
    ...(Object.keys(normalizedAttrs).length ? { attrs: normalizedAttrs } : {}),
    ...(mergedChildren.length ? { content: mergedChildren } : {}),
  };
}

function stripV2Defaults(node: ProseMirrorJSONContent): ProseMirrorJSONContent {
  return {
    ...node,
    ...(node.attrs === undefined
      ? {}
      : {
          attrs: Object.fromEntries(
            Object.entries(node.attrs).filter(([key, value]) => key !== 'source' || value !== null),
          ),
        }),
    ...(node.content === undefined ? {} : { content: node.content.map(stripV2Defaults) }),
  };
}

function projectDecodedDocument(
  fragment: Y.XmlFragment,
  schemaVersion: number,
): DocumentProjection {
  const mediaReferences: MediaReference[] = [];
  const mediaNodeIds = new Set<string>();
  const content: ProseMirrorJSONContent[] = [];
  for (const child of fragment.toArray()) {
    if (!(child instanceof Y.XmlElement)) {
      throw invalidContent('Document fragment contains a non-element root child.');
    }
    content.push(serializeXmlElement(child, mediaNodeIds, mediaReferences, schemaVersion));
  }

  const rawJson: ProseMirrorJSONContent = {
    type: 'doc',
    ...(content.length ? { content } : {}),
  };
  if (content.length === 0) {
    return {
      contentJson: rawJson,
      mediaReferences,
      schemaVersion,
    };
  }

  try {
    const document = documentProjectionSchema.nodeFromJSON(rawJson);
    document.check();

    const rawContentJson = document.toJSON() as ProseMirrorJSONContent;
    const contentJson = schemaVersion < 2 ? stripV2Defaults(rawContentJson) : rawContentJson;
    const normalized = normalizeJsonForComparison(rawJson);
    const expected = schemaVersion < 2 ? stripV2Defaults(normalized) : normalized;
    if (!isDeepStrictEqual(expected, contentJson)) {
      throw invalidContent('ProseMirror normalization would lose document content.');
    }

    return {
      contentJson,
      mediaReferences,
      schemaVersion,
    };
  } catch (error) {
    if (error instanceof DocumentProjectionError) throw error;
    throw invalidContent('Captured Yjs content is incompatible with schema v1.', error);
  }
}

export function projectDocument(input: ProjectDocumentInput): DocumentProjection {
  if (![1, DOCUMENT_PROJECTION_SCHEMA_VERSION].includes(input.tiptapSchemaVersion)) {
    throw new DocumentProjectionError(
      'unsupported_schema_version',
      `Unsupported TipTap schema version "${input.tiptapSchemaVersion}".`,
    );
  }

  const document = new Y.Doc();
  try {
    if (input.yjsState.byteLength > 0) {
      Y.applyUpdate(document, input.yjsState);
    }
    return projectDecodedDocument(
      document.getXmlFragment(DOCUMENT_PROJECTION_YJS_FIELD),
      input.tiptapSchemaVersion,
    );
  } catch (error) {
    if (error instanceof DocumentProjectionError) throw error;
    throw new DocumentProjectionError('invalid_yjs_state', 'Captured Yjs state is invalid.', {
      cause: error,
    });
  } finally {
    document.destroy();
  }
}
