import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = resolve(process.cwd(), 'src');
const APP_ROOT = resolve(process.cwd(), 'app');

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    if (!entry.isFile() || /\.spec\.[jt]sx?$/.test(entry.name)) return [];
    return /\.[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function readSources(directory: string): string {
  return collectSourceFiles(directory)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

describe('page editor architecture boundaries', () => {
  it('оставляет persisted document entity независимой от React, feature и widget', () => {
    const entitySources = readSources(resolve(SOURCE_ROOT, 'entities/page-document'));

    expect(entitySources).not.toMatch(/from ['"](?:react|@tiptap\/react|@\/features|@\/widgets)/);
  });

  it('не добавляет document API или Hocuspocus в editor core', () => {
    const editorCoreSources = [
      readSources(resolve(SOURCE_ROOT, 'features/page-editing')),
      readSources(resolve(SOURCE_ROOT, 'widgets/page-editor')),
    ].join('\n');

    expect(editorCoreSources).not.toMatch(/from ['"]@\/shared\/api/);
    expect(editorCoreSources).not.toMatch(/from ['"]@hocuspocus\//);
  });

  it('не монтирует editor core в app route entry points', () => {
    const entryPointSources = readSources(APP_ROOT);

    expect(entryPointSources).not.toMatch(/from ['"]@\/widgets\/page-editor/);
    expect(entryPointSources).not.toMatch(/from ['"]@\/features\/page-editing/);
  });

  it('не монтирует editor core в workspace до reviewed production composition', () => {
    const workspaceMainSource = readFileSync(
      resolve(SOURCE_ROOT, 'pages/workspace/ui/workspace-main.tsx'),
      'utf8',
    );

    expect(workspaceMainSource).not.toMatch(/from ['"]@\/widgets\/page-editor/);
    expect(workspaceMainSource).not.toMatch(/from ['"]@\/features\/page-editing/);
    expect(workspaceMainSource).toContain('Редактор страницы появится в следующем обновлении.');
  });
});
