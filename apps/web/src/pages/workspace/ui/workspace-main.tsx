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
import { ContentContainer, Heading } from '@/shared/ui';
import { CollaborativePageEditor } from './collaborative-page-editor';
import { PageCover } from './page-cover';
import { PublicationManagement } from './publication-management';

export type WorkspaceMainProps = Readonly<{
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
      <ContentContainer as="section" className="min-w-0">
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
      </ContentContainer>
    );
  }

  return (
    <ContentContainer as="section" className="min-w-0">
      <div className="space-y-6">
        {page.coverAssetId ? <PageCover page={page} placement="banner" /> : null}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Heading as="h1" variant="page">
              {getPageDisplayTitle(page.title)}
            </Heading>
            {!page.coverAssetId ? <PageCover page={page} placement="inline" /> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {pageCapabilities?.canManagePage ? (
              <PublicationManagement
                capabilities={pageCapabilities}
                key={page.id}
                pageId={page.id}
              />
            ) : null}
            {pageCapabilities?.canManageAccess ? <PageAccessPanel page={page} /> : null}
          </div>
        </div>
        <CollaborativePageEditor
          capabilities={pageCapabilities ?? getPageCapabilities(page.accessRole)}
          pageId={page.id}
        />
      </div>
    </ContentContainer>
  );
}
