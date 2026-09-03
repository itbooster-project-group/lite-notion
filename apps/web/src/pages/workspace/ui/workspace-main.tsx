'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getBreadcrumbs,
  getPageDisplayTitle,
  type MoveIntent,
  type NormalizedPageTree,
  type ProjectPageTree,
  selectPage,
} from '@/entities/page';
import { type PageDeleteRequest, PageTree } from '@/features/workspace-management';
import { workspacePagePath } from '@/shared/routing';
import { Heading, Text } from '@/shared/ui';

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
      <main className="min-w-0 p-6 sm:p-8">
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
      </main>
    );
  }

  const breadcrumbs = getBreadcrumbs(normalizedTree, page.id);

  return (
    <main className="min-w-0 p-6 sm:p-8">
      <nav aria-label="Хлебные крошки">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {breadcrumbs.map((breadcrumb, index) => (
            <li className="flex items-center gap-2" key={breadcrumb.id}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {breadcrumb.id === page.id ? (
                <span aria-current="page">{breadcrumb.title}</span>
              ) : (
                <Link
                  className="hover:text-foreground hover:underline"
                  href={workspacePagePath(breadcrumb.id)}
                >
                  {breadcrumb.title}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <section className="mt-6 space-y-6">
        <Heading as="h1" variant="page">
          {getPageDisplayTitle(page.title)}
        </Heading>
        <div className="rounded-xl border border-dashed bg-muted/30 p-8">
          <Text variant="caption">Редактор страницы появится в следующем обновлении.</Text>
        </div>
      </section>
    </main>
  );
}
