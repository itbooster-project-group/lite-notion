import { expect, test } from '@playwright/test';

test('aligns desktop shell headers and preserves responsive breadcrumb layout', async ({
  page,
}, testInfo) => {
  const user = {
    createdAt: '2026-01-01T00:00:00.000Z',
    email: 'shell-layout@example.com',
    id: 'shell-layout-user',
    name: 'Shell Layout',
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });

    if (path === '/api/v1/auth/refresh') {
      await json({ accessToken: 'shell-layout-token', expiresIn: 3600 });
    } else if (path === '/api/v1/auth/me') {
      await json(user);
    } else if (path === '/api/v1/projects' && request.method() === 'GET') {
      await json([
        { id: 'workspace-layout-project', name: 'Project layout check', ownerId: user.id },
      ]);
    } else if (path === '/api/v1/pages' && request.method() === 'GET') {
      await json([]);
    } else if (path === '/api/v1/pages/shared') {
      await json([]);
    } else {
      await route.fulfill({ status: 404, json: { message: 'Unexpected shell layout request' } });
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Проекты' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Project layout check' })).toBeVisible();

  const oneLineGeometry = await page.evaluate(() => {
    const sidebarHeader = document.querySelector('#desktop-sidebar > div');
    const workspaceHeader = document.querySelector('main header > div');
    if (!(sidebarHeader instanceof HTMLElement) || !(workspaceHeader instanceof HTMLElement)) {
      throw new Error('Shell header elements are unavailable');
    }
    const sidebarRect = sidebarHeader.getBoundingClientRect();
    const workspaceRect = workspaceHeader.getBoundingClientRect();
    return {
      sidebarBottom: sidebarRect.bottom,
      sidebarHeight: sidebarRect.height,
      sidebarBorder: getComputedStyle(sidebarHeader).borderBottomWidth,
      workspaceBottom: workspaceRect.bottom,
      workspaceHeight: workspaceRect.height,
      workspaceBorder: getComputedStyle(workspaceHeader).borderBottomWidth,
    };
  });

  expect(oneLineGeometry.sidebarHeight).toBe(64);
  expect(oneLineGeometry.workspaceHeight).toBe(64);
  expect(oneLineGeometry.sidebarBottom).toBe(oneLineGeometry.workspaceBottom);
  expect(oneLineGeometry.sidebarBorder).toBe('1px');
  expect(oneLineGeometry.workspaceBorder).toBe('1px');
  await page.screenshot({ path: testInfo.outputPath('desktop-one-line.png') });

  const longBreadcrumb = 'Оченьдлинноесловобезпробелов'.repeat(12);
  await page
    .getByRole('navigation', { name: 'Хлебные крошки' })
    .locator('[aria-current="page"]')
    .evaluate((element, text) => {
      element.textContent = text;
    }, longBreadcrumb);
  const wrappedGeometry = await page.evaluate(() => {
    const sidebarHeader = document.querySelector('#desktop-sidebar > div');
    const workspaceHeader = document.querySelector('main header > div');
    const breadcrumbs = document.querySelector('nav[aria-label="Хлебные крошки"]');
    if (
      !(sidebarHeader instanceof HTMLElement) ||
      !(workspaceHeader instanceof HTMLElement) ||
      !(breadcrumbs instanceof HTMLElement)
    ) {
      throw new Error('Long breadcrumb elements are unavailable');
    }
    return {
      breadcrumbHeight: breadcrumbs.getBoundingClientRect().height,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      sidebarHeight: sidebarHeader.getBoundingClientRect().height,
      workspaceHeight: workspaceHeader.getBoundingClientRect().height,
    };
  });

  expect(wrappedGeometry.sidebarHeight).toBe(64);
  expect(wrappedGeometry.workspaceHeight).toBeGreaterThan(64);
  expect(wrappedGeometry.breadcrumbHeight).toBeGreaterThan(20);
  expect(wrappedGeometry.documentWidth).toBeLessThanOrEqual(wrappedGeometry.viewportWidth);
  await page.screenshot({ path: testInfo.outputPath('desktop-long-breadcrumb.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#desktop-sidebar')).toBeHidden();
  const mobileTrigger = page.getByRole('button', { name: 'Открыть боковую панель' });
  await expect(mobileTrigger).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('mobile-workspace-header.png') });
  await mobileTrigger.click();
  const mobileSidebar = page.getByRole('dialog', { name: 'Боковая панель' });
  await expect(mobileSidebar.getByRole('button', { name: 'Закрыть боковую панель' })).toBeVisible();
  await expect(mobileSidebar.getByRole('button', { name: 'Свернуть боковую панель' })).toHaveCount(
    0,
  );
});
