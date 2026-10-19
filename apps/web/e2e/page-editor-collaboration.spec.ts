import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';

const pageId = process.env.PLAYWRIGHT_PAGE_ID;

type TestIdentity = Readonly<{ id: string; name: string }>;
type TestCredentials = Readonly<{ email: string; password: string }>;

function getTestCredentials(slot: 'A' | 'B'): TestCredentials | undefined {
  const email = process.env[`PLAYWRIGHT_USER_${slot}_EMAIL`];
  const password = process.env[`PLAYWRIGHT_USER_${slot}_PASSWORD`];
  return email && password ? { email, password } : undefined;
}

function getTestIdentity(slot: 'A' | 'B'): TestIdentity | undefined {
  const id = process.env[`PLAYWRIGHT_USER_${slot}_ID`];
  const name = process.env[`PLAYWRIGHT_USER_${slot}_NAME`];
  return id && name ? { id, name } : undefined;
}

async function createAuthenticatedPage(
  browser: Browser,
  credentials: TestCredentials,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const targetPath = `/pages/${pageId}`;

  await page.goto(`/login?next=${encodeURIComponent(targetPath)}`);
  await page.locator('#login-email').fill(credentials.email);
  await page.locator('#login-password').fill(credentials.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: 'Войти' }).click(),
  ]);
  await page.goto(targetPath);

  return { context, page };
}

test.describe('page editor collaboration', () => {
  test('uploads an asset image once, syncs it to two users and removes the same node', async ({
    browser,
  }) => {
    if (process.env.PLAYWRIGHT_ASSET_UPLOAD_ENABLED !== '1') {
      test.skip(true, 'PLAYWRIGHT_ASSET_UPLOAD_ENABLED=1 is required for the storage-backed E2E');
      return;
    }
    const credentialsA = getTestCredentials('A');
    const credentialsB = getTestCredentials('B');
    if (!pageId || !credentialsA || !credentialsB) {
      test.skip(true, 'PLAYWRIGHT_PAGE_ID and both editor credentials are required');
      return;
    }

    const [{ context: contextA, page: pageA }, { context: contextB, page: pageB }] =
      await Promise.all([
        createAuthenticatedPage(browser, credentialsA),
        createAuthenticatedPage(browser, credentialsB),
      ]);
    const uploadRequests: string[] = [];
    pageA.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/v1/assets/uploads')) {
        uploadRequests.push(request.url());
      }
    });

    try {
      await Promise.all([pageA.goto(`/pages/${pageId}`), pageB.goto(`/pages/${pageId}`)]);
      const editorA = pageA.locator('[data-page-editor-content]');
      const editorB = pageB.locator('[data-page-editor-content]');
      await expect(editorA).toBeVisible();
      await expect(editorB).toBeVisible();
      await expect(editorB).toHaveAttribute('contenteditable', 'true');
      await editorA.click();
      await pageA.keyboard.type('/image');
      await pageA.getByRole('option', { name: 'Изображение' }).click();
      await pageA.getByLabel('Описание изображения').fill('Shared asset image');
      await pageA.getByLabel('Выбрать файл изображения').setInputFiles({
        name: 'shared.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=',
          'base64',
        ),
      });
      await pageA.getByRole('button', { name: 'Вставить изображение' }).click();

      const imageA = editorA.locator('[data-image-node-id]');
      const imageB = editorB.locator('[data-image-node-id]');
      await expect(imageA).toHaveCount(1);
      await expect(imageB).toHaveCount(1);
      const stableNodeId = await imageA.getAttribute('data-image-node-id');
      expect(stableNodeId).toBeTruthy();
      expect(uploadRequests).toHaveLength(1);
      await expect(imageA.locator('img')).toHaveAttribute('src', /^https:/);
      await expect(imageB.locator('img')).toHaveAttribute('src', /^https:/);

      await pageA.reload();
      const restoredImage = pageA.locator('[data-image-node-id]');
      await expect(restoredImage).toHaveCount(1);
      await expect(restoredImage).toHaveAttribute('data-image-node-id', stableNodeId ?? '');

      await contextA.setOffline(true);
      await expect(pageA.locator('[data-collaboration-status="offline"]')).toBeVisible();
      await contextA.setOffline(false);
      await expect(pageA.locator('[data-collaboration-status="connected"]')).toBeVisible();
      await expect(restoredImage).toHaveCount(1);

      await pageB.route('**/api/v1/assets/*/read-url*', (route) =>
        route.fulfill({ body: JSON.stringify({ message: 'forbidden' }), status: 403 }),
      );
      await pageB.reload();
      await expect(pageB.getByText('Изображение недоступно')).toBeVisible();
      await expect(pageB.getByRole('button', { name: 'Удалить изображение' })).toBeVisible();

      await pageB.getByRole('button', { name: 'Удалить изображение' }).click();
      await expect(pageA.locator('[data-image-node-id]')).toHaveCount(0);
      await pageA.reload();
      await expect(pageA.locator('[data-image-node-id]')).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('synchronizes two independent browser contexts and restores persisted content', async ({
    browser,
  }) => {
    if (!pageId) {
      test.skip(true, 'PLAYWRIGHT_PAGE_ID is required for the collaboration E2E environment');
      return;
    }
    const credentials = getTestCredentials('A');
    if (!credentials) {
      test.skip(
        true,
        'PLAYWRIGHT_USER_A_EMAIL and PLAYWRIGHT_USER_A_PASSWORD are required for collaboration E2E',
      );
      return;
    }
    const [{ context: contextA, page: pageA }, { context: contextB, page: pageB }] =
      await Promise.all([
        createAuthenticatedPage(browser, credentials),
        createAuthenticatedPage(browser, credentials),
      ]);
    const documentPutRequests: string[] = [];

    pageA.on('request', (request) => {
      if (
        request.method() === 'PUT' &&
        request.url().includes(`/api/v1/pages/${pageId}/document`)
      ) {
        documentPutRequests.push(request.url());
      }
    });

    try {
      await Promise.all([pageA.goto(`/pages/${pageId}`), pageB.goto(`/pages/${pageId}`)]);
      const editorA = pageA.locator('[data-page-editor-content]');
      const editorB = pageB.locator('[data-page-editor-content]');
      await expect(editorA).toBeVisible();
      await expect(editorB).toBeVisible();

      await editorA.click();
      await pageA.keyboard.type('from-a');
      await expect(editorB).toContainText('from-a');

      await editorB.click();
      await pageB.keyboard.type('from-b');
      await expect(editorA).toContainText('from-b');

      await Promise.all([
        editorA.press('End').then(() => pageA.keyboard.type('concurrent-a')),
        editorB.press('End').then(() => pageB.keyboard.type('concurrent-b')),
      ]);
      await expect(editorA).toContainText('concurrent-a');
      await expect(editorA).toContainText('concurrent-b');
      await expect(editorB).toContainText('concurrent-a');
      await expect(editorB).toContainText('concurrent-b');
      expect(documentPutRequests).toHaveLength(0);

      await pageA.reload();
      await expect(pageA.locator('[data-page-editor-content]')).toContainText('concurrent-a');
      await expect(pageA.locator('[data-page-editor-content]')).toContainText('concurrent-b');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('shows presence and remote caret for two different users', async ({ browser }) => {
    const credentialsA = getTestCredentials('A');
    const credentialsB = getTestCredentials('B');
    const userA = getTestIdentity('A');
    const userB = getTestIdentity('B');
    if (!pageId || !credentialsA || !credentialsB || !userA || !userB) {
      test.skip(
        true,
        'PLAYWRIGHT_PAGE_ID, both credentials and explicit user identities are required',
      );
      return;
    }

    const [{ context: contextA, page: pageA }, { context: contextB, page: pageB }] =
      await Promise.all([
        createAuthenticatedPage(browser, credentialsA),
        createAuthenticatedPage(browser, credentialsB),
      ]);

    try {
      await Promise.all([pageA.goto(`/pages/${pageId}`), pageB.goto(`/pages/${pageId}`)]);
      const participantsA = pageA.locator('[data-participants] [data-participant-id]');
      const participantsB = pageB.locator('[data-participants] [data-participant-id]');
      await expect(participantsA).toHaveCount(2);
      await expect(participantsB).toHaveCount(2);

      const editorA = pageA.locator('[data-page-editor-content]');
      await editorA.click();
      await pageA.keyboard.type('presence');
      await editorA.press('ControlOrMeta+A');

      await expect(pageB.locator('.collaboration-carets__caret').first()).toBeVisible();
      const remoteLabel = pageB
        .locator('.collaboration-carets__label')
        .filter({ hasText: userA.name })
        .first();
      await expect(remoteLabel).toBeVisible();
      await expect(pageB.locator('.collaboration-carets__selection').first()).toBeVisible();
      await expect(remoteLabel).not.toHaveText('');

      const colors = await pageB.evaluate(({ id, name }) => {
        const participant = document.querySelector(`[data-participant-id="${id}"]`);
        const label = [...document.querySelectorAll('.collaboration-carets__label')].find(
          (element) => element.textContent?.trim() === name,
        );
        return {
          participant: participant ? getComputedStyle(participant).backgroundColor : null,
          label: label ? getComputedStyle(label).backgroundColor : null,
        };
      }, userA);
      expect(colors.participant).toBe(colors.label);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('deduplicates participants for two tabs of one user', async ({ browser }) => {
    const credentialsA = getTestCredentials('A');
    const userA = getTestIdentity('A');
    if (!pageId || !credentialsA || !userA) {
      test.skip(true, 'PLAYWRIGHT_PAGE_ID, user A credentials and user A identity are required');
      return;
    }
    const [{ context: contextA, page: pageA }, { context: contextB, page: pageB }] =
      await Promise.all([
        createAuthenticatedPage(browser, credentialsA),
        createAuthenticatedPage(browser, credentialsA),
      ]);

    try {
      await Promise.all([pageA.goto(`/pages/${pageId}`), pageB.goto(`/pages/${pageId}`)]);
      const participantsA = pageA.locator('[data-participants] [data-participant-id]');
      const participantsB = pageB.locator('[data-participants] [data-participant-id]');
      await expect(participantsA).toHaveCount(1);
      await expect(participantsB).toHaveCount(1);

      await pageA.locator('[data-page-editor-content]').click();
      await pageA.keyboard.type('tab presence');
      await expect(pageB.locator('.collaboration-carets__caret').first()).toBeVisible();
      await pageB.reload();
      await expect(pageB.locator('[data-participants] [data-participant-id]')).toHaveCount(1);

      await contextB.close();
      await expect(participantsA).toHaveCount(1);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('keeps a viewer read-only while showing document presence', async ({ browser }) => {
    const credentialsA = getTestCredentials('A');
    const credentialsB = getTestCredentials('B');
    const userA = getTestIdentity('A');
    const userB = getTestIdentity('B');
    if (!pageId || !credentialsA || !credentialsB || !userA || !userB) {
      test.skip(true, 'Two credentials and explicit user identities are required');
      return;
    }

    const [{ context: contextA, page: pageA }, { context: contextB, page: pageB }] =
      await Promise.all([
        createAuthenticatedPage(browser, credentialsA),
        createAuthenticatedPage(browser, credentialsB),
      ]);

    try {
      await Promise.all([pageA.goto(`/pages/${pageId}`), pageB.goto(`/pages/${pageId}`)]);
      await expect(pageB.locator('[data-page-editor-content]')).toHaveAttribute(
        'contenteditable',
        'false',
      );
      await expect(pageB.getByLabel('Обложка')).toHaveCount(0);
      await expect(pageB.getByRole('button', { name: 'Удалить обложку' })).toHaveCount(0);
      await expect(pageB.locator('[data-participants] [data-participant-id]')).toHaveCount(2);
      await expect(pageB.locator(`[data-participant-id="${userA.id}"]`)).toBeVisible();
      await expect(pageB.locator(`[data-participant-id="${userB.id}"]`)).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('cleans participants when one client switches to another page', async ({ browser }) => {
    const credentialsA = getTestCredentials('A');
    const credentialsB = getTestCredentials('B');
    const secondPageId = process.env.PLAYWRIGHT_SECOND_PAGE_ID;
    const userA = getTestIdentity('A');
    const userB = getTestIdentity('B');
    if (!pageId || !credentialsA || !credentialsB || !secondPageId || !userA || !userB) {
      test.skip(true, 'Two credentials, identities and PLAYWRIGHT_SECOND_PAGE_ID are required');
      return;
    }

    const [{ context: contextA, page: pageA }, { context: contextB, page: pageB }] =
      await Promise.all([
        createAuthenticatedPage(browser, credentialsA),
        createAuthenticatedPage(browser, credentialsB),
      ]);

    try {
      await Promise.all([pageA.goto(`/pages/${pageId}`), pageB.goto(`/pages/${pageId}`)]);
      await expect(pageA.locator('[data-participants] [data-participant-id]')).toHaveCount(2);

      await pageA.goto(`/pages/${secondPageId}`);
      await expect(pageA.locator('[data-page-editor-content]')).toBeVisible();
      await expect(pageA.locator('[data-participants] [data-participant-id]')).toHaveCount(1);
      await expect(pageB.locator('[data-participants] [data-participant-id]')).toHaveCount(1);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('reconnects the same session after a temporary network outage', async ({ browser }) => {
    const credentialsA = getTestCredentials('A');
    const credentialsB = getTestCredentials('B');
    const userA = getTestIdentity('A');
    const userB = getTestIdentity('B');
    if (!pageId || !credentialsA || !credentialsB || !userA || !userB) {
      test.skip(true, 'Two credentials and explicit user identities are required');
      return;
    }

    const [{ context: contextA, page: pageA }, { context: contextB, page: pageB }] =
      await Promise.all([
        createAuthenticatedPage(browser, credentialsA),
        createAuthenticatedPage(browser, credentialsB),
      ]);

    try {
      await Promise.all([pageA.goto(`/pages/${pageId}`), pageB.goto(`/pages/${pageId}`)]);
      await expect(pageA.locator('[data-collaboration-status="connected"]')).toBeVisible();
      await expect(pageB.locator('[data-participants] [data-participant-id]')).toHaveCount(2);

      await contextA.setOffline(true);
      await expect(pageA.locator('[data-collaboration-status="offline"]')).toBeVisible();

      await contextA.setOffline(false);
      await expect(pageA.locator('[data-collaboration-status="connected"]')).toBeVisible();
      await expect(pageA.locator('[data-participants] [data-participant-id]')).toHaveCount(2);
      await expect(pageB.locator('[data-participants] [data-participant-id]')).toHaveCount(2);
      await expect(pageA.locator(`[data-participant-id="${userA.id}"]`)).toHaveCount(1);
      await expect(pageB.locator(`[data-participant-id="${userA.id}"]`)).toHaveCount(1);

      await pageA.locator('[data-page-editor-content]').click();
      await pageA.keyboard.type('after-reconnect');
      await expect(pageB.locator('[data-page-editor-content]')).toContainText('after-reconnect');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
