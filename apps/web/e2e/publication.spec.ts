import { expect, test } from '@playwright/test';

const pageId = process.env.PLAYWRIGHT_PUBLICATION_DISPOSABLE_PAGE_ID;
const email = process.env.PLAYWRIGHT_USER_A_EMAIL;
const password = process.env.PLAYWRIGHT_USER_A_PASSWORD;
const canRunPublicationE2E = Boolean(
  pageId && email && password && process.env.PLAYWRIGHT_PUBLICATION_E2E_ENABLED === '1',
);

test.describe('publication flow', () => {
  test.skip(
    !canRunPublicationE2E,
    'A disposable unpublished page, editor credentials, and PLAYWRIGHT_PUBLICATION_E2E_ENABLED=1 are required',
  );

  test('publishes, keeps snapshot stable, republishes, changes slug, unpublishes, and republishes', async ({
    browser,
    page,
  }) => {
    if (!pageId || !email || !password) {
      throw new Error('Publication E2E fixture is incomplete');
    }

    const firstSlug = `publication-e2e-${Date.now()}`;
    const secondSlug = `${firstSlug}-renamed`;
    await page.goto(`/login?next=${encodeURIComponent(`/pages/${pageId}`)}`);
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/'),
      page.getByRole('button', { name: 'Войти' }).click(),
    ]);
    await page.goto(`/pages/${pageId}`);

    await page.getByRole('button', { name: 'Публикация' }).click();
    await page.getByLabel('Адрес публикации').fill(firstSlug);
    await page.getByLabel('SEO title').fill('Publication E2E title');
    await page.getByLabel('SEO description').fill('Publication E2E description');
    await page.getByRole('button', { name: 'Опубликовать' }).click();
    await expect(page.getByText('Страница опубликована.')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    const publicContext = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8080',
    });
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`/p/${firstSlug}`);
    await expect(publicPage.locator('article')).toBeVisible();
    await expect(publicPage).toHaveTitle('Publication E2E title');
    const originalPublicText = await publicPage.locator('article').innerText();

    const editor = page.locator('[data-page-editor-content]');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' Unpublished change');
    await expect(editor).toContainText('Unpublished change');
    await page.getByRole('button', { name: 'Публикация' }).click();
    await page.getByRole('button', { name: 'Republish' }).click();
    await expect(page.getByText('Новая опубликованная версия создана.')).toBeVisible();

    await publicPage.goto(`/p/${firstSlug}`);
    await expect(publicPage.locator('article')).toContainText('Unpublished change');
    expect(originalPublicText).not.toContain('Unpublished change');

    await page.goto(`/pages/${pageId}`);
    await page.getByRole('button', { name: 'Публикация' }).click();
    await page.getByLabel('Адрес публикации').fill(secondSlug);
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();
    await expect(page.getByRole('link', { name: new RegExp(`/p/${secondSlug}`) })).toBeVisible();
    await publicPage.goto(`/p/${firstSlug}`);
    await expect(publicPage.getByText('This page could not be found.')).toBeVisible();

    await page.goto(`/pages/${pageId}`);
    await page.getByRole('button', { name: 'Публикация' }).click();
    await page.getByRole('button', { name: 'Снять с публикации' }).click();
    await page.getByRole('button', { name: 'Подтвердить снятие' }).click();
    await expect(page.getByText('Публикация снята.')).toBeVisible();
    await publicPage.goto(`/p/${secondSlug}`);
    await expect(publicPage.getByText('This page could not be found.')).toBeVisible();

    await page.goto(`/pages/${pageId}`);
    await page.getByRole('button', { name: 'Публикация' }).click();
    await page.getByRole('button', { name: 'Опубликовать снова' }).click();
    await expect(page.getByText('Новая опубликованная версия создана.')).toBeVisible();
    await publicPage.goto(`/p/${secondSlug}`);
    await expect(publicPage.locator('article')).toBeVisible();
    await publicContext.close();
  });
});
