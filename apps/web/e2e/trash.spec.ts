import { expect, test } from '@playwright/test';

test('opens trash, restores a page and permanently deletes a project', async ({ page }) => {
  let pageDeleted = true;
  let projectDeleted = true;
  let projectPurgeAttempts = 0;
  let cascadePurgeAttempts = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const user = {
      createdAt: '2026-01-01T00:00:00.000Z',
      email: 'trash-e2e@example.com',
      id: 'owner',
      name: 'Trash E2E',
    };
    const json = (body: unknown) => route.fulfill({ json: body });

    if (path === '/api/v1/auth/login' && request.method() === 'POST') {
      await json({ accessToken: 'test-token', expiresIn: 3600, user });
    } else if (path === '/api/v1/auth/refresh') {
      await route.fulfill({ status: 401, json: { message: 'No session' } });
    } else if (path === '/api/v1/auth/me') {
      await json(user);
    } else if (path === '/api/v1/projects' && request.method() === 'GET') {
      await json([{ id: 'active-project', name: 'Active project', ownerId: 'owner' }]);
    } else if (path === '/api/v1/pages' && request.method() === 'GET') {
      await json([]);
    } else if (path === '/api/v1/pages/shared') {
      await json([]);
    } else if (path === '/api/v1/pages/trash' && request.method() === 'GET') {
      await json(
        pageDeleted
          ? [
              {
                children: [],
                createdAt: user.createdAt,
                createdById: 'owner',
                deletedAt: user.createdAt,
                id: 'deleted-page',
                ownerId: 'owner',
                parentPageId: null,
                position: 'a',
                projectId: 'active-project',
                title: 'Deleted page',
                updatedAt: user.createdAt,
              },
            ]
          : [],
      );
    } else if (path === '/api/v1/projects/trash' && request.method() === 'GET') {
      await json(
        projectDeleted
          ? [
              {
                deletedAt: user.createdAt,
                id: 'deleted-project',
                name: 'Deleted project',
                ownerId: 'owner',
              },
            ]
          : [],
      );
    } else if (path === '/api/v1/pages/deleted-page/restore') {
      pageDeleted = false;
      await json({
        accessMode: 'inherit',
        accessRole: 'owner',
        createdAt: user.createdAt,
        createdById: 'owner',
        id: 'deleted-page',
        ownerId: 'owner',
        parentPageId: null,
        position: 'a',
        projectId: 'active-project',
        title: 'Deleted page',
        updatedAt: user.createdAt,
      });
    } else if (path === '/api/v1/projects/trash/deleted-project' && request.method() === 'DELETE') {
      if (new URL(request.url()).searchParams.get('cascade') === 'true') {
        cascadePurgeAttempts += 1;
        projectDeleted = false;
        await route.fulfill({ status: 204, body: '' });
      } else {
        projectPurgeAttempts += 1;
        await route.fulfill({
          status: 409,
          json: {
            error: 'Conflict',
            message: ['Проект содержит самостоятельно удалённые страницы.', 'Independent page'],
            path,
            statusCode: 409,
            timestamp: user.createdAt,
          },
        });
      }
    } else {
      await route.fulfill({ status: 404, json: { message: 'Unexpected API request' } });
    }
  });

  await page.goto('/login?next=%2Ftrash');
  await page.locator('#login-email').fill('trash-e2e@example.com');
  await page.locator('#login-password').fill('trash-e2e-password');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/trash'),
    page.getByRole('button', { name: 'Войти' }).click(),
  ]);

  await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Страницы' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('list', { name: 'Удалённые страницы' })).toBeVisible();

  await page
    .getByRole('button', { name: /^Восстановить:/ })
    .first()
    .click();
  const restoreDialog = page.getByRole('dialog');
  if (await restoreDialog.getByRole('combobox', { name: 'Целевой проект' }).count()) {
    await restoreDialog.getByRole('combobox', { name: 'Целевой проект' }).click();
    await page.getByRole('option').first().click();
  }
  await restoreDialog.getByRole('button', { name: 'Восстановить' }).click();
  await expect(restoreDialog).not.toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveText('В корзине нет страниц.');

  await page.getByRole('tab', { name: 'Проекты' }).click();
  await expect(page.getByRole('list', { name: 'Удалённые проекты' })).toBeVisible();
  await page
    .getByRole('button', { name: /^Удалить навсегда:/ })
    .first()
    .click();
  const purgeDialog = page.getByRole('dialog');
  await expect(purgeDialog).toContainText('без возможности восстановления');
  await purgeDialog.getByRole('button', { name: 'Удалить навсегда' }).click();
  await expect(purgeDialog).toContainText('Проект содержит самостоятельно удалённые страницы.');
  await expect(purgeDialog).toContainText('Independent page');
  expect(projectPurgeAttempts).toBe(1);
  await purgeDialog.getByRole('button', { name: 'Удалить каскадно' }).click();
  await expect(purgeDialog).not.toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveText('В корзине нет проектов.');
  expect(projectPurgeAttempts).toBe(1);
  expect(cascadePurgeAttempts).toBe(1);
});
