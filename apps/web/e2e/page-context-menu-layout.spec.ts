import { expect, test } from '@playwright/test';

test('keeps page action menus readable and within the viewport on desktop and mobile', async ({
  page,
}, testInfo) => {
  const user = {
    createdAt: '2026-01-01T00:00:00.000Z',
    email: 'page-menu-layout@example.com',
    id: 'page-menu-layout-user',
    name: 'Page Menu Layout',
  };
  const project = { id: 'page-menu-project', name: 'Page Menu Project', ownerId: user.id };
  const pageNode = {
    accessMode: 'inherit',
    accessRole: 'owner',
    children: [],
    coverAssetId: null,
    createdAt: user.createdAt,
    createdById: user.id,
    id: 'page-menu-page',
    ownerId: user.id,
    parentPageId: null,
    position: 'a',
    projectId: project.id,
    title: 'Page Menu Page',
    updatedAt: user.createdAt,
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });

    if (path === '/api/v1/auth/refresh') {
      await json({ accessToken: 'page-menu-layout-token', expiresIn: 3600 });
    } else if (path === '/api/v1/auth/me') {
      await json(user);
    } else if (path === '/api/v1/projects' && request.method() === 'GET') {
      await json([project]);
    } else if (path === '/api/v1/pages' && request.method() === 'GET') {
      await json([pageNode]);
    } else if (path === '/api/v1/pages/shared') {
      await json([]);
    } else {
      await route.fulfill({ status: 404, json: { message: 'Unexpected page menu request' } });
    }
  });

  async function checkOpenMenu(
    trigger: ReturnType<typeof page.getByRole>,
    minimumHeight: number,
    screenshotName: string,
  ) {
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    const layout = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const itemHeights = [...element.querySelectorAll('[role="menuitem"]')].map(
        (item) => item.getBoundingClientRect().height,
      );
      return {
        bottom: rect.bottom,
        itemHeights,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.width).toBeGreaterThanOrEqual(200);
    expect(layout.width).toBeLessThanOrEqual(256);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.bottom).toBeLessThanOrEqual(layout.viewportHeight);
    expect(layout.itemHeights.length).toBeGreaterThan(0);
    expect(layout.itemHeights.every((height) => height >= minimumHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      layout.viewportWidth,
    );
    await page.screenshot({ path: testInfo.outputPath(screenshotName) });
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const sidebarPageActions = page.getByRole('button', { name: 'Действия для Page Menu Page' });
  await checkOpenMenu(sidebarPageActions, 36, 'sidebar-menu-desktop.png');

  await page.goto('/projects/page-menu-project');
  const projectTreePageActions = page
    .getByRole('tree', { name: 'Страницы проекта' })
    .getByRole('button', { name: 'Действия для Page Menu Page' });
  await checkOpenMenu(projectTreePageActions, 36, 'project-tree-menu-desktop.png');
  await projectTreePageActions.evaluate((element) => {
    element.style.position = 'fixed';
    element.style.right = '0';
    element.style.top = '420px';
  });
  await checkOpenMenu(projectTreePageActions, 36, 'project-tree-menu-viewport-edge.png');

  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть боковую панель' }).click();
  const mobileSidebar = page.getByRole('dialog', { name: 'Боковая панель' });
  await checkOpenMenu(
    mobileSidebar.getByRole('button', { name: 'Действия для Page Menu Page' }),
    44,
    'sidebar-menu-mobile.png',
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await checkOpenMenu(
    mobileSidebar.getByRole('button', { name: 'Действия для Page Menu Page' }),
    44,
    'sidebar-menu-mobile-dark.png',
  );
});
