import Link from 'next/link';
import { Heading, Text } from '@/shared/ui';
import type { MoveIntent, NormalizedPageTree, ProjectTree } from '../model/page-tree';
import { getBreadcrumbs, getPageDisplayTitle, selectPage } from '../model/page-tree';

import { PageTree } from './page-tree';

type WorkspaceMainProps = Readonly<{
  activePageId: string | undefined;
  normalizedTree: NormalizedPageTree;
  onCreatePage: (parentPageId: string | null, title: string) => Promise<void>;
  onMovePage: (intent: MoveIntent) => Promise<void>;
  onRenamePage: (pageId: string, title: string) => Promise<void>;
  onSelectPage: (pageId: string) => void;
  projectTree: ProjectTree;
  projectName: string;
}>;

export function WorkspaceMain({
  activePageId,
  normalizedTree,
  onCreatePage,
  onMovePage,
  onRenamePage,
  onSelectPage,
  projectName,
  projectTree,
}: WorkspaceMainProps) {
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
          onSelectPage={onSelectPage}
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
                  href={`/pages/${breadcrumb.id}`}
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
