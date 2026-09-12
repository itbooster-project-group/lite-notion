'use client';

import { useRouter } from 'next/navigation';
import {
  getPageCapabilities,
  getPageDisplayTitle,
  type MoveIntent,
  type NormalizedPage,
  type NormalizedPageTree,
  type PageCapabilities,
  type ProjectPageTree,
  selectPage,
} from '@/entities/page';
import { PageAccessPanel } from '@/features/page-access';
import { type PageDeleteRequest, PageTree } from '@/features/workspace-management';
import { workspacePagePath } from '@/shared/routing';
import { Heading } from '@/shared/ui';
import { CollaborativePageEditor } from './collaborative-page-editor';

type WorkspaceMainProps = Readonly<{
  activePageId: string | undefined;
  activePage: NormalizedPage | undefined;
  pageCapabilities: PageCapabilities | undefined;
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
  activePage,
  pageCapabilities,
  normalizedTree,
  onCreatePage,
  onMovePage,
  onRenamePage,
  onRequestDeletePage,
  projectName,
  projectTree,
}: WorkspaceMainProps) {
  const router = useRouter();
  const page = activePage ?? selectPage(normalizedTree, activePageId);

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
        <div className="flex items-start justify-between gap-4">
          <Heading as="h1" variant="page">
            {getPageDisplayTitle(page.title)}
          </Heading>
          {pageCapabilities?.canManageAccess ? <PageAccessPanel page={page} /> : null}
        </div>
        <CollaborativePageEditor
          capabilities={pageCapabilities ?? getPageCapabilities(page.accessRole)}
          pageId={page.id}
        />
      </div>
    </section>
  );
}
