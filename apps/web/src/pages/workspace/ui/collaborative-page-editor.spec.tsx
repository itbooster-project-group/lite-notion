import { render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CollaborativePageEditor } from './collaborative-page-editor';

const testState = vi.hoisted(() => ({
  sessions: [] as Array<{ destroy: ReturnType<typeof vi.fn> }>,
  auth: {
    getAccessToken: () => 'token',
    refreshAccessToken: async () => undefined,
  },
}));

vi.mock('@/entities/session', () => ({
  useSession: () => testState.auth,
}));

vi.mock('@/features/page-editing', () => ({
  createCollaborativePageDocumentSession: () => {
    const session = {
      connectionStatus: 'connecting',
      destroy: vi.fn(),
      editable: false,
      status: 'loading',
      subscribe: () => () => undefined,
    };
    testState.sessions.push(session);
    return session;
  },
  pageRoomName: (pageId: string) => `page:${pageId}`,
}));

vi.mock('@/widgets/page-editor', () => ({
  PageEditor: () => <div data-testid="page-editor" />,
}));

describe('CollaborativePageEditor lifecycle', () => {
  it('cleans the first effect session before StrictMode remount', async () => {
    render(
      <StrictMode>
        <CollaborativePageEditor pageId="page-id" />
      </StrictMode>,
    );

    await waitFor(() => expect(testState.sessions).toHaveLength(2));
    expect(testState.sessions[0]?.destroy).toHaveBeenCalledOnce();
    expect(testState.sessions[1]?.destroy).not.toHaveBeenCalled();
  });
});
