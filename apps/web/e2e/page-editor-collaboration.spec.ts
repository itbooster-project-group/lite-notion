import { expect, test } from '@playwright/test';

const pageId = process.env.PLAYWRIGHT_PAGE_ID;

test.describe('page editor collaboration', () => {
  test('synchronizes two independent browser contexts and restores persisted content', async ({
    browser,
  }) => {
    if (!pageId) {
      throw new Error('PLAYWRIGHT_PAGE_ID is required for the collaboration E2E environment');
    }
    const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
    const contextA = await browser.newContext(storageState ? { storageState } : undefined);
    const contextB = await browser.newContext(storageState ? { storageState } : undefined);
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
});
