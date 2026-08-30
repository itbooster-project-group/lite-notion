'use client';

import type { ProjectDto } from '@/shared/api';
import { Text } from '@/shared/ui';
import { buildProjectTree, type MoveIntent, type NormalizedPageTree } from '../model/page-tree';

import { PageTree } from './page-tree';

type WorkspaceSidebarProps = Readonly<{
  activePageId: string | undefined;
  normalizedTree: NormalizedPageTree;
  onCreatePage: (projectId: string, parentPageId: string | null, title: string) => Promise<void>;
  onMovePage: (intent: MoveIntent) => Promise<void>;
  onRenamePage: (pageId: string, title: string) => Promise<void>;
  onSelectPage: (pageId: string) => void;
  onSelectProject: (projectId: string) => void;
  projects: readonly ProjectDto[];
}>;

export function WorkspaceSidebar({
  activePageId,
  normalizedTree,
  onCreatePage,
  onMovePage,
  onRenamePage,
  onSelectPage,
  onSelectProject,
  projects,
}: WorkspaceSidebarProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="space-y-4" role="tree" aria-label="Проекты и страницы">
          {projects.map((project) => {
            const projectTree = buildProjectTree(normalizedTree, project.id);
            const isEmpty =
              (projectTree.items[projectTree.rootItemId]?.childrenIds.length ?? 0) === 0;

            return (
              <section key={project.id} className="space-y-2">
                {isEmpty ? <Text variant="caption">Создайте первую страницу проекта.</Text> : null}
                <div className="pl-3">
                  <PageTree
                    activePageId={activePageId}
                    header={
                      <button
                        className="w-full rounded-md px-2 py-1 text-left text-sm font-medium hover:bg-accent"
                        type="button"
                        onClick={() => onSelectProject(project.id)}
                      >
                        {project.name}
                      </button>
                    }
                    normalizedTree={normalizedTree}
                    projectTree={projectTree}
                    onCreatePage={(parentPageId, title) =>
                      onCreatePage(project.id, parentPageId, title)
                    }
                    onMovePage={onMovePage}
                    onRenamePage={onRenamePage}
                    onSelectPage={onSelectPage}
                  />
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
