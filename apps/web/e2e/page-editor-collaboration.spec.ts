import { expect, test } from '@playwright/test';

const pageId = process.env.PLAYWRIGHT_PAGE_ID;

test.describe('page editor collaboration', () => {
  test('synchronizes two independent browser contexts and restores persisted content', async ({
    browser,
  }) => {
    if (!pageId) {
      throw new Error('PLAYWRIGHT_PAGE_ID is required for the collaboration E2E environment');
    }
    const storageStateA =
      process.env.PLAYWRIGHT_STORAGE_STATE_A ?? process.env.PLAYWRIGHT_STORAGE_STATE;
    const storageStateB = process.env.PLAYWRIGHT_STORAGE_STATE_A2 ?? storageStateA;
    const contextA = await browser.newContext(storageStateA ? { storageState: storageStateA } : {});
    const contextB = await browser.newContext(storageStateB ? { storageState: storageStateB } : {});
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
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
    const storageStateA = process.env.PLAYWRIGHT_STORAGE_STATE_A;
    const storageStateB = process.env.PLAYWRIGHT_STORAGE_STATE_B;
    if (!pageId || !storageStateA || !storageStateB) {
      test.skip(
        true,
        'PLAYWRIGHT_PAGE_ID and both user storage states are required for the multi-user presence E2E',
      );
      return;
    }

    const contextA = await browser.newContext({
      storageState: storageStateA,
    });
    const contextB = await browser.newContext({
      storageState: storageStateB,
    });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

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
        .filter({ hasText: 'User' })
        .first();
      await expect(remoteLabel).toBeVisible();
      await expect(pageB.locator('.collaboration-carets__selection').first()).toBeVisible();
      await expect(remoteLabel).not.toHaveText('');

      const colors = await pageB.evaluate(() => {
        const participant = document.querySelector(
          '[data-participant-id="6f79fd24-142a-481f-8fc8-45cb0c7087f3"]',
        );
        const label = [...document.querySelectorAll('.collaboration-carets__label')].find(
          (element) => element.textContent?.trim() === 'User',
        );
        return {
          participant: participant ? getComputedStyle(participant).backgroundColor : null,
          label: label ? getComputedStyle(label).backgroundColor : null,
        };
      });
      expect(colors.participant).toBe(colors.label);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('deduplicates participants for two tabs of one user', async ({ browser }) => {
    const storageStateA =
      process.env.PLAYWRIGHT_STORAGE_STATE_A ?? process.env.PLAYWRIGHT_STORAGE_STATE;
    const storageStateB = process.env.PLAYWRIGHT_STORAGE_STATE_A2;
    if (!pageId || !storageStateA || !storageStateB) {
      test.skip(
        true,
        'PLAYWRIGHT_PAGE_ID and two same-user storage states are required for this E2E',
      );
      return;
    }
    const contextA = await browser.newContext({ storageState: storageStateA });
    const contextB = await browser.newContext({ storageState: storageStateB });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

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
    const storageStateA = process.env.PLAYWRIGHT_STORAGE_STATE_A;
    const storageStateB = process.env.PLAYWRIGHT_STORAGE_STATE_B;
    if (!pageId || !storageStateA || !storageStateB) {
      test.skip(true, 'Two authenticated storage states are required for the viewer E2E');
      return;
    }

    const contextA = await browser.newContext({ storageState: storageStateA });
    const contextB = await browser.newContext({ storageState: storageStateB });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await Promise.all([pageA.goto(`/pages/${pageId}`), pageB.goto(`/pages/${pageId}`)]);
      await expect(pageB.locator('[data-page-editor-content]')).toHaveAttribute(
        'contenteditable',
        'false',
      );
      await expect(pageB.locator('[data-participants] [data-participant-id]')).toHaveCount(2);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('cleans participants when one client switches to another page', async ({ browser }) => {
    const storageStateA = process.env.PLAYWRIGHT_STORAGE_STATE_A;
    const storageStateB = process.env.PLAYWRIGHT_STORAGE_STATE_B;
    const secondPageId = process.env.PLAYWRIGHT_SECOND_PAGE_ID;
    if (!pageId || !storageStateA || !storageStateB || !secondPageId) {
      test.skip(true, 'Two storage states and PLAYWRIGHT_SECOND_PAGE_ID are required');
      return;
    }

    const contextA = await browser.newContext({ storageState: storageStateA });
    const contextB = await browser.newContext({ storageState: storageStateB });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

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
});
