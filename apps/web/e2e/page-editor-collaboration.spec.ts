import { expect, test } from '@playwright/test';

const pageId = process.env.PLAYWRIGHT_PAGE_ID;

type TestIdentity = Readonly<{ id: string; name: string }>;

function getTestIdentity(slot: 'A' | 'B'): TestIdentity | undefined {
  const id = process.env[`PLAYWRIGHT_USER_${slot}_ID`];
  const name = process.env[`PLAYWRIGHT_USER_${slot}_NAME`];
  return id && name ? { id, name } : undefined;
}

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
    const userA = getTestIdentity('A');
    const userB = getTestIdentity('B');
    if (!pageId || !storageStateA || !storageStateB || !userA || !userB) {
      test.skip(
        true,
        'PLAYWRIGHT_PAGE_ID, both storage states and explicit user identities are required',
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
    const storageStateA =
      process.env.PLAYWRIGHT_STORAGE_STATE_A ?? process.env.PLAYWRIGHT_STORAGE_STATE;
    const storageStateB = process.env.PLAYWRIGHT_STORAGE_STATE_A2;
    const userA = getTestIdentity('A');
    if (!pageId || !storageStateA || !storageStateB || !userA) {
      test.skip(
        true,
        'PLAYWRIGHT_PAGE_ID, two same-user storage states and user A identity are required',
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
    const userA = getTestIdentity('A');
    const userB = getTestIdentity('B');
    if (!pageId || !storageStateA || !storageStateB || !userA || !userB) {
      test.skip(true, 'Two storage states and explicit user identities are required');
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
      await expect(pageB.locator(`[data-participant-id="${userA.id}"]`)).toBeVisible();
      await expect(pageB.locator(`[data-participant-id="${userB.id}"]`)).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('cleans participants when one client switches to another page', async ({ browser }) => {
    const storageStateA = process.env.PLAYWRIGHT_STORAGE_STATE_A;
    const storageStateB = process.env.PLAYWRIGHT_STORAGE_STATE_B;
    const secondPageId = process.env.PLAYWRIGHT_SECOND_PAGE_ID;
    const userA = getTestIdentity('A');
    const userB = getTestIdentity('B');
    if (!pageId || !storageStateA || !storageStateB || !secondPageId || !userA || !userB) {
      test.skip(true, 'Two storage states, identities and PLAYWRIGHT_SECOND_PAGE_ID are required');
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

  test('reconnects the same session after a temporary network outage', async ({ browser }) => {
    const storageStateA = process.env.PLAYWRIGHT_STORAGE_STATE_A;
    const storageStateB = process.env.PLAYWRIGHT_STORAGE_STATE_B;
    const userA = getTestIdentity('A');
    const userB = getTestIdentity('B');
    if (!pageId || !storageStateA || !storageStateB || !userA || !userB) {
      test.skip(true, 'Two storage states and explicit user identities are required');
      return;
    }

    const contextA = await browser.newContext({ storageState: storageStateA });
    const contextB = await browser.newContext({ storageState: storageStateB });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

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
