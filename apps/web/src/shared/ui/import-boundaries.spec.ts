import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** Сравнения ниже записаны через `/`, а `node:path` на Windows отдаёт `\`. */
const toPosix = (value: string): string => value.replaceAll('\\', '/');

const uiRoot = toPosix(dirname(fileURLToPath(import.meta.url)));
const srcRoot = toPosix(resolve(uiRoot, '../..'));
const webRoot = toPosix(resolve(srcRoot, '..'));
const forms = new Set(['button', 'input', 'label', 'textarea', 'checkbox', 'select']);

function inspect(file: string, source: string): string[] {
  const result: string[] = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const current = toPosix(file);
  const insideUi = current.startsWith(`${uiRoot}/`);
  const insideShadcn = current.startsWith(`${uiRoot}/shadcn/`);
  function check(path: string) {
    const target = path.startsWith('@/')
      ? resolve(srcRoot, path.slice(2))
      : path.startsWith('.')
        ? resolve(dirname(current), path)
        : undefined;
    if (!target) return;
    const normalized = toPosix(target).replace(/\.(tsx?|jsx?)$/, '');
    if (!insideUi && normalized.startsWith(`${uiRoot}/`) && normalized !== `${uiRoot}/index`) {
      result.push(`Deep UI import: ${path}`);
    }
    if (
      insideShadcn &&
      normalized.startsWith(`${uiRoot}/`) &&
      !normalized.startsWith(`${uiRoot}/shadcn/`)
    ) {
      result.push(`shadcn depends on project UI: ${path}`);
    }
    if (insideShadcn && normalized === uiRoot) result.push(`shadcn depends on public UI: ${path}`);
    if (
      current === `${uiRoot}/index.ts` &&
      normalized.startsWith(`${uiRoot}/shadcn/`) &&
      forms.has(normalized.slice(`${uiRoot}/shadcn/`.length))
    ) {
      result.push(`Public generated form export: ${path}`);
    }
  }
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      check(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first)) check(first.text);
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      check(node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return result;
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : ['.ts', '.tsx', '.js', '.jsx'].includes(extname(path))
        ? [path]
        : [];
  });
}

describe('UI import boundaries', () => {
  it('keeps product imports public and generated forms behind wrappers', () => {
    const violations = [...files(srcRoot), ...files(join(webRoot, 'app'))].flatMap((file) =>
      inspect(file, readFileSync(file, 'utf8')).map(
        (error) => `${relative(webRoot, file)}: ${error}`,
      ),
    );
    expect(violations).toEqual([]);
  });
  it.each([
    "import { Button } from '@/shared/ui/button'",
    "export { Input } from '../../shared/ui/shadcn/input'",
    "const module = import('@/shared/ui/shadcn/select')",
    "type Props = import('@/shared/ui/input').InputProps",
  ])('rejects product deep imports: %s', (source) => {
    expect(inspect(join(srcRoot, 'features/example/view.tsx'), source)).toHaveLength(1);
  });
  it('allows public imports and local wrapper composition', () => {
    expect(
      inspect(join(srcRoot, 'features/example/view.tsx'), "import { Button } from '@/shared/ui'"),
    ).toEqual([]);
    expect(inspect(join(uiRoot, 'button.tsx'), "import { Button } from './shadcn/button'")).toEqual(
      [],
    );
    expect(
      inspect(join(uiRoot, 'shadcn/combobox.tsx'), "import { Button } from './button'"),
    ).toEqual([]);
  });
  it('rejects reverse dependencies and generated form reexports', () => {
    expect(
      inspect(join(uiRoot, 'shadcn/button.tsx'), "import { Tooltip } from '../tooltip'"),
    ).toHaveLength(1);
    expect(
      inspect(join(uiRoot, 'index.ts'), "export { Button } from './shadcn/button'"),
    ).toHaveLength(1);
    expect(inspect(join(uiRoot, 'index.ts'), "export { Dialog } from './shadcn/dialog'")).toEqual(
      [],
    );
  });
});
