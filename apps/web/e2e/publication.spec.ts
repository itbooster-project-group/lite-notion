import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import { pageDocumentToJSON } from '../src/entities/page-document';

const pageId = process.env.PLAYWRIGHT_PUBLICATION_DISPOSABLE_PAGE_ID;
const email = process.env.PLAYWRIGHT_USER_A_EMAIL;
const password = process.env.PLAYWRIGHT_USER_A_PASSWORD;
const internalApiOrigin = process.env.PLAYWRIGHT_INTERNAL_API_ORIGIN;
const internalServiceToken = process.env.PLAYWRIGHT_INTERNAL_SERVICE_TOKEN;
const canRunPublicationE2E = Boolean(
  pageId &&
    email &&
    password &&
    internalApiOrigin &&
    internalServiceToken &&
    process.env.PLAYWRIGHT_PUBLICATION_E2E_ENABLED === '1',
);

test.describe('publication flow', () => {
  test.skip(
    !canRunPublicationE2E,
    'A disposable page, editor credentials, internal document-read fixture, and PLAYWRIGHT_PUBLICATION_E2E_ENABLED=1 are required',
  );

  test('publishes, keeps snapshot stable, republishes, changes slug, unpublishes, and republishes', async ({
    browser,
    page,
  }) => {
    if (!pageId || !email || !password || !internalApiOrigin || !internalServiceToken) {
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

    const editor = page.locator('[data-page-editor-content]');
    await expect(editor).toBeVisible();
    await expect(page.locator('[data-collaboration-status="connected"]')).toBeVisible();
    const contentA = `publication-e2e-A-${firstSlug}`;
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(` ${contentA}`);
    await expect(editor).toContainText(contentA);
    await waitForPersistedContent(pageId, contentA, internalApiOrigin, internalServiceToken);

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
    await expect(publicPage.locator('article')).toContainText(contentA);

    const contentB = `publication-e2e-B-${firstSlug}`;
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(` ${contentB}`);
    await expect(editor).toContainText(contentB);
    await waitForPersistedContent(pageId, contentB, internalApiOrigin, internalServiceToken);

    await publicPage.goto(`/p/${firstSlug}`);
    await expect(publicPage.locator('article')).toContainText(contentA);
    await expect(publicPage.locator('article')).not.toContainText(contentB);

    await page.getByRole('button', { name: 'Публикация' }).click();
    await page.getByRole('button', { name: 'Republish' }).click();
    await expect(page.getByText('Новая опубликованная версия создана.')).toBeVisible();

    await publicPage.goto(`/p/${firstSlug}`);
    await expect(publicPage.locator('article')).toContainText(contentA);
    await expect(publicPage.locator('article')).toContainText(contentB);
    expect(originalPublicText).not.toContain(contentB);

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

async function waitForPersistedContent(
  targetPageId: string,
  marker: string,
  apiOrigin: string,
  serviceToken: string,
) {
  const endpoint = new URL(
    `/internal/pages/${encodeURIComponent(targetPageId)}/document`,
    apiOrigin,
  );
  await expect
    .poll(
      async () => {
        const response = await fetch(endpoint, {
          headers: { 'x-internal-service-token': serviceToken },
        });
        if (!response.ok) return false;
        const value: unknown = await response.json();
        if (!isPersistedDocument(value)) return false;

        const document = new Y.Doc();
        try {
          if (value.yjsState) Y.applyUpdate(document, Buffer.from(value.yjsState, 'base64'));
          return JSON.stringify(pageDocumentToJSON(document)).includes(marker);
        } finally {
          document.destroy();
        }
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

function isPersistedDocument(value: unknown): value is Readonly<{ yjsState: string }> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'yjsState' in value &&
    typeof value.yjsState === 'string'
  );
}
