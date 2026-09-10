'use client';

import { useRouter } from 'next/navigation';
import {
  getPageDisplayTitle,
  type MoveIntent,
  type NormalizedPageTree,
  type ProjectPageTree,
  selectPage,
} from '@/entities/page';
import { type PageDeleteRequest, PageTree } from '@/features/workspace-management';
import { workspacePagePath } from '@/shared/routing';
import { Heading } from '@/shared/ui';
import { CollaborativePageEditor } from './collaborative-page-editor';

type WorkspaceMainProps = Readonly<{
  activePageId: string | undefined;
  normalizedTree: NormalizedPageTree;
  onCreatePage: (parentPageId: string | null, title: string) => Promise<void>;
  onMovePage: (intent: MoveIntent) => Promise<void>;
  onRenamePage: (pageId: string, title: string) => Promise<void>;
  onRequestDeletePage: (request: PageDeleteRequest) => void;
  projectTree: ProjectPageTree;
  projectName: string;
}>;

export function WorkspaceMain({
  activePageId,
  normalizedTree,
  onCreatePage,
  onMovePage,
  onRenamePage,
  onRequestDeletePage,
  projectName,
  projectTree,
}: WorkspaceMainProps) {
  const router = useRouter();
  const page = selectPage(normalizedTree, activePageId);

  if (!page) {
    return (
      <section className="min-w-0 p-6 sm:p-8">
        <PageTree
          activePageId={undefined}
          header={
            <Heading as="h1" variant="page">
              {projectName}
            </Heading>
          }
          normalizedTree={normalizedTree}
          projectTree={projectTree}
          onCreatePage={onCreatePage}
          onMovePage={onMovePage}
          onRenamePage={onRenamePage}
          onRequestDeletePage={onRequestDeletePage}
          onSelectPage={(pageId) => router.push(workspacePagePath(pageId))}
        />
      </section>
    );
  }

  return (
    <section className="min-w-0 p-6 sm:p-8">
      <div className="space-y-6">
        <Heading as="h1" variant="page">
          {getPageDisplayTitle(page.title)}
        </Heading>
        <CollaborativePageEditor pageId={page.id} />
      </div>
    </section>
  );
}
