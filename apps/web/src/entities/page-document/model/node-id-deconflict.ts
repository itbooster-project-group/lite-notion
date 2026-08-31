import { Extension } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode, Slice } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';

import { isPageDocumentNodeId } from '../lib/media-validation';
import {
  claimUniquePageDocumentNodeId,
  isPageDocumentMediaNodeType,
} from '../lib/node-id-lifecycle';

function collectNodeIds(document: ProseMirrorNode): Set<string> {
  const nodeIds = new Set<string>();

  document.descendants((node) => {
    const nodeId = node.attrs.nodeId;
    if (isPageDocumentMediaNodeType(node.type.name) && isPageDocumentNodeId(nodeId)) {
      nodeIds.add(nodeId);
    }
  });

  return nodeIds;
}

function deconflictFragment(fragment: Fragment, usedNodeIds: Set<string>): Fragment {
  const nodes: ProseMirrorNode[] = [];

  fragment.forEach((node) => {
    const content = node.content.size
      ? deconflictFragment(node.content, usedNodeIds)
      : node.content;

    if (!isPageDocumentMediaNodeType(node.type.name)) {
      nodes.push(content === node.content ? node : node.copy(content));
      return;
    }

    nodes.push(
      node.type.create(
        {
          ...node.attrs,
          nodeId: claimUniquePageDocumentNodeId(node.attrs.nodeId, usedNodeIds),
        },
        content,
        node.marks,
      ),
    );
  });

  return Fragment.fromArray(nodes);
}

export const PageDocumentNodeIdDeconflict = Extension.create({
  name: 'pageDocumentNodeIdDeconflict',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPasted(slice, view) {
            return new Slice(
              deconflictFragment(slice.content, collectNodeIds(view.state.doc)),
              slice.openStart,
              slice.openEnd,
            );
          },
        },
      }),
    ];
  },
});
