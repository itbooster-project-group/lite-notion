import { render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollaborativePageEditor } from './collaborative-page-editor';

const testState = vi.hoisted(() => ({
  sessions: [] as Array<{ destroy: ReturnType<typeof vi.fn>; editable: boolean }>,
  auth: {
    getAccessToken: () => 'token',
    refreshAccessToken: async () => undefined,
  },
}));

vi.mock('@/entities/session', () => ({
  useSession: () => testState.auth,
}));

vi.mock('@/features/page-editing', () => ({
  createCollaborativePageDocumentSession: ({ editable }: { editable: boolean }) => {
    const session = {
      connectionStatus: 'connecting',
      destroy: vi.fn(),
      editable,
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
  afterEach(() => {
    testState.sessions.length = 0;
  });

  it('cleans the first effect session before StrictMode remount', async () => {
    render(
      <StrictMode>
        <CollaborativePageEditor accessRole="viewer" pageId="page-id" />
      </StrictMode>,
    );

    await waitFor(() => expect(testState.sessions).toHaveLength(2));
    expect(testState.sessions[0]?.destroy).toHaveBeenCalledOnce();
    expect(testState.sessions[1]?.destroy).not.toHaveBeenCalled();
  });

  it.each([
    ['viewer', false],
    ['editor', true],
    ['owner', true],
  ] as const)('maps %s access role to editable=%s', async (accessRole, editable) => {
    render(<CollaborativePageEditor accessRole={accessRole} pageId="page-id" />);

    await waitFor(() => expect(testState.sessions).toHaveLength(1));
    expect(testState.sessions[0]?.editable).toBe(editable);
  });

  it('recreates the session when editable capability changes', async () => {
    const view = render(<CollaborativePageEditor accessRole="viewer" pageId="page-id" />);
    await waitFor(() => expect(testState.sessions).toHaveLength(1));

    view.rerender(<CollaborativePageEditor accessRole="editor" pageId="page-id" />);

    await waitFor(() => expect(testState.sessions).toHaveLength(2));
    expect(testState.sessions[0]?.destroy).toHaveBeenCalledOnce();
    expect(testState.sessions[1]?.editable).toBe(true);
  });

  it('does not require recreation when editor changes to owner', async () => {
    const view = render(<CollaborativePageEditor accessRole="editor" pageId="page-id" />);
    await waitFor(() => expect(testState.sessions).toHaveLength(1));

    view.rerender(<CollaborativePageEditor accessRole="owner" pageId="page-id" />);
    await waitFor(() => expect(testState.sessions).toHaveLength(1));

    expect(testState.sessions[0]?.destroy).not.toHaveBeenCalled();
  });

  it('recreates the session when page id changes', async () => {
    const view = render(<CollaborativePageEditor accessRole="editor" pageId="page-a" />);
    await waitFor(() => expect(testState.sessions).toHaveLength(1));

    view.rerender(<CollaborativePageEditor accessRole="editor" pageId="page-b" />);

    await waitFor(() => expect(testState.sessions).toHaveLength(2));
    expect(testState.sessions[0]?.destroy).toHaveBeenCalledOnce();
  });
});
