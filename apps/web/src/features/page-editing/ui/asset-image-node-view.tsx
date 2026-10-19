'use client';

import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { useState } from 'react';
import { useAssetReadUrl } from '@/entities/asset';
import {
  normalizePersistedPageDocumentImageAttributes,
  PageDocumentImage,
} from '@/entities/page-document';
import { AssetImage, Button } from '@/shared/ui';

type AssetImageNodeViewProps = ReactNodeViewProps &
  Readonly<{
    pageId?: string | undefined;
    userId?: string | undefined;
  }>;

function AssetImageNodeView({ deleteNode, editor, node, pageId, userId }: AssetImageNodeViewProps) {
  const [failedExternalUrl, setFailedExternalUrl] = useState<string>();
  const attrs = normalizePersistedPageDocumentImageAttributes(node.attrs);
  const assetId = attrs?.source?.assetId;
  const resolved = useAssetReadUrl(assetId, userId, { id: pageId ?? '', kind: 'page' });
  const src = assetId ? resolved.src : (attrs?.src ?? undefined);
  const externalUnavailable = Boolean(attrs?.src && failedExternalUrl === attrs.src);
  const state = assetId ? resolved.state : src && !externalUnavailable ? 'ready' : 'unavailable';

  return (
    <NodeViewWrapper
      as="figure"
      className="my-4"
      contentEditable={false}
      data-image-node-id={attrs?.nodeId}
    >
      <AssetImage
        alt={attrs?.decorative ? '' : (attrs?.alt ?? '')}
        className="mx-auto h-auto max-w-full rounded-md"
        fallback={
          <div
            className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
            role="img"
            aria-label={attrs?.alt || 'Изображение недоступно'}
          >
            Изображение недоступно
          </div>
        }
        height={400}
        onImageError={
          assetId ? resolved.onImageError : () => setFailedExternalUrl(attrs?.src ?? undefined)
        }
        src={src}
        state={state}
        width={800}
      />
      {attrs?.caption ? (
        <figcaption className="mt-2 text-center text-sm text-muted-foreground">
          {attrs.caption}
        </figcaption>
      ) : null}
      {editor.isEditable ? (
        <Button className="mt-2" onClick={deleteNode} size="sm" type="button" variant="outline">
          Удалить изображение
        </Button>
      ) : null}
    </NodeViewWrapper>
  );
}

export function createAssetImageEditorExtension(pageId?: string, userId?: string) {
  return PageDocumentImage.extend({
    addNodeView() {
      return ReactNodeViewRenderer((props) => (
        <AssetImageNodeView {...props} pageId={pageId} userId={userId} />
      ));
    },
  });
}
