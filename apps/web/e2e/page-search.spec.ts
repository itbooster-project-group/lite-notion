import { expect, type Page, test } from '@playwright/test';

const fixturePages = Array.from({ length: 20 }, (_, index) => ({
  accessMode: 'inherit',
  accessRole: 'owner',
  children: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  createdById: 'search-owner',
  coverAssetId: null,
  id: index === 19 ? 'indexed-target' : `search-page-${index}`,
  ownerId: 'search-owner',
  parentPageId: null,
  position: String(index),
  projectId: 'search-project',
  title: index === 19 ? 'Indexed search target' : `Search fixture ${index}`,
  updatedAt: '2026-01-01T00:00:00.000Z',
}));

test('opens indexed search fixture with shortcut and navigates to the selected page', async ({
  page,
}) => {
  await prepareSearchFixture(page);
  await authenticateFixture(page);

  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Поиск страниц' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Поиск страниц' })).toBeFocused();
  await dialog.getByRole('combobox', { name: 'Поиск страниц' }).fill('indexed-fixture');
  await expect(dialog.getByRole('option', { name: 'Indexed search target' })).toBeVisible();
  await dialog.getByRole('option', { name: 'Indexed search target' }).click();

  await expect(page).toHaveURL(/\/pages\/indexed-target$/);
  await expect(page.getByRole('heading', { name: 'Indexed search target' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Поиск страниц' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/pages\/indexed-target$/);
  await expect(page.getByRole('heading', { name: 'Indexed search target' })).toBeVisible();
});

test('keeps the search usable with touch on a narrow mobile viewport', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await prepareSearchFixture(page);
  await authenticateFixture(page);

  await page.getByRole('button', { name: 'Поиск страниц' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Поиск страниц' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeLessThanOrEqual(390);
  expect(box?.height).toBeLessThanOrEqual(844);
  expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    390,
  );
  await expect(dialog.getByRole('button', { name: 'Закрыть поиск' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрыть поиск' }).tap();
  await expect(page.getByRole('button', { name: 'Открыть боковую панель' })).toBeVisible();
  await page.getByRole('button', { name: 'Поиск страниц' }).tap();
  await expect(dialog).toBeVisible();

  const input = dialog.getByRole('combobox', { name: 'Поиск страниц' });
  await input.tap();
  await input.fill('indexed-fixture');
  const results = dialog.getByRole('listbox', { name: 'Результаты поиска' });
  await expect
    .poll(() => results.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  const target = results.getByRole('option', { name: 'Indexed search target' });
  await expect(target).toBeVisible();
  await target.tap();

  await expect(page).toHaveURL(/\/pages\/indexed-target$/);
  await expect(page.getByRole('heading', { name: 'Indexed search target' })).toBeVisible();
  await context.close();
});

async function prepareSearchFixture(page: Page) {
  const fixtureUser = {
    createdAt: '2026-01-01T00:00:00.000Z',
    email: 'page-search-e2e@example.com',
    id: 'search-owner',
    name: 'Search E2E',
  };
  const targetPage = fixturePages.at(-1);

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });

    if (path === '/api/v1/auth/login' && request.method() === 'POST') {
      await json({ accessToken: 'search-test-token', expiresIn: 3600, user: fixtureUser });
    } else if (path === '/api/v1/auth/refresh') {
      await json({ accessToken: 'search-test-token', expiresIn: 3600 });
    } else if (path === '/api/v1/auth/me') {
      await json(fixtureUser);
    } else if (path === '/api/v1/projects' && request.method() === 'GET') {
      await json([
        { id: 'search-project', name: 'Search fixture project', ownerId: 'search-owner' },
      ]);
    } else if (path === '/api/v1/pages' && request.method() === 'GET') {
      await json(fixturePages);
    } else if (path === '/api/v1/pages/shared') {
      await json([]);
    } else if (path === '/api/v1/search') {
      await json(
        new URL(request.url()).searchParams.get('query') === 'indexed-fixture'
          ? fixturePages.map((item) => ({ pageId: item.id, title: item.title, snippet: null }))
          : [],
      );
    } else if (path === `/api/v1/pages/${targetPage?.id}` && request.method() === 'GET') {
      await json(targetPage);
    } else if (path === `/api/v1/pages/${targetPage?.id}/document`) {
      await json({ blocks: [] });
    } else {
      await route.fulfill({ status: 404, json: { message: 'Unexpected fixture request' } });
    }
  });
}

async function authenticateFixture(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Поиск страниц' })).toBeVisible();
}
