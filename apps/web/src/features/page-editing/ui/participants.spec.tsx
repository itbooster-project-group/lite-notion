import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/shared/api';
import type { PageDocumentPresence, PresenceUser } from '../model/page-document-session';
import { Participants } from './participants';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createPresence(users: readonly PresenceUser[]): PageDocumentPresence {
  return {
    users,
    subscribe: vi.fn(() => vi.fn()),
  };
}

function renderParticipants(presence: PageDocumentPresence, currentUserId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Participants currentUserId={currentUserId} presence={presence} />
    </QueryClientProvider>,
  );
}

describe('Participants', () => {
  it('shows initials, accessible names, colors and overflow', () => {
    const users = Array.from({ length: 6 }, (_, index) => ({
      id: `user-${index}`,
      name: `User ${index}`,
      color: '#2563eb',
    }));

    renderParticipants(createPresence(users));

    expect(screen.getByRole('list', { name: 'Участники документа' })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^User [0-4]$/)).toHaveLength(5);
    expect(screen.getByLabelText('Ещё 1 участников')).toBeInTheDocument();
    expect(screen.queryByLabelText('User 5')).not.toBeInTheDocument();
  });

  it('subscribes to the domain presence contract without receiving a provider', () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const presence = { users: [], subscribe } satisfies PageDocumentPresence;

    const view = renderParticipants(presence);
    expect(subscribe).toHaveBeenCalledOnce();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('updates when the session publishes a new participants snapshot', () => {
    let users: readonly PresenceUser[] = [{ id: 'user-a', name: 'Ada Lovelace', color: '#2563eb' }];
    let notify: () => void = () => undefined;
    const presence: PageDocumentPresence = {
      get users() {
        return users;
      },
      subscribe(listener) {
        notify = listener;
        return () => undefined;
      },
    };

    renderParticipants(presence);
    expect(screen.getByLabelText('Ada Lovelace')).toBeInTheDocument();

    users = [{ id: 'user-b', name: 'Bob', color: '#16a34a' }];
    act(() => notify());

    expect(screen.queryByLabelText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Bob')).toBeInTheDocument();
  });

  it('resolves a changed avatar identity without participant mutation controls', async () => {
    const assetId = '22222222-2222-4222-8222-222222222222';
    const readUrl = vi.spyOn(api, 'createAvatarReadUrl').mockResolvedValue({
      url: `https://cdn.example.com/${assetId}.jpg`,
      expiresInSeconds: 300,
    });
    let users: readonly PresenceUser[] = [{ id: 'user-a', name: 'Ada Lovelace', color: '#2563eb' }];
    let notify: () => void = () => undefined;
    const presence: PageDocumentPresence = {
      get users() {
        return users;
      },
      subscribe(listener) {
        notify = listener;
        return () => undefined;
      },
    };

    renderParticipants(presence, 'current-user');
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveTextContent('AL');
    users = [{ id: 'user-a', name: 'Ada Lovelace', color: '#2563eb', avatarAssetId: assetId }];
    act(() => notify());

    expect(await screen.findByRole('img', { name: 'Ada Lovelace: аватар' })).toHaveAttribute(
      'src',
      `https://cdn.example.com/${assetId}.jpg`,
    );
    expect(readUrl).toHaveBeenCalledWith('user-a', assetId);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    users = [{ id: 'user-a', name: 'Ada Lovelace', color: '#2563eb' }];
    act(() => notify());
    expect(await screen.findByRole('img', { name: 'Ada Lovelace' })).toHaveTextContent('AL');
    expect(screen.queryByRole('img', { name: 'Ada Lovelace: аватар' })).not.toBeInTheDocument();
  });

  it('resolves each participant avatar with that participant identity', async () => {
    vi.spyOn(api, 'createAvatarReadUrl').mockImplementation(async (userId, assetId) => ({
      url: `https://cdn.example.com/${userId}/${assetId}.jpg`,
      expiresInSeconds: 300,
    }));
    renderParticipants(
      createPresence([
        {
          id: 'user-a',
          name: 'Ada',
          color: '#2563eb',
          avatarAssetId: 'asset-a',
        },
        {
          id: 'user-b',
          name: 'Bob',
          color: '#16a34a',
          avatarAssetId: 'asset-b',
        },
      ]),
      'viewer-id',
    );

    expect(await screen.findByRole('img', { name: 'Ada: аватар' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/user-a/asset-a.jpg',
    );
    expect(await screen.findByRole('img', { name: 'Bob: аватар' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/user-b/asset-b.jpg',
    );
  });

  it('keeps accessible initials when a participant avatar is unavailable', async () => {
    vi.spyOn(api, 'createAvatarReadUrl').mockRejectedValue(
      Object.assign(new Error('forbidden'), { status: 403 }),
    );
    renderParticipants(
      createPresence([
        {
          id: 'user-a',
          name: 'Ada Lovelace',
          color: '#2563eb',
          avatarAssetId: '22222222-2222-4222-8222-222222222222',
        },
      ]),
      'current-user',
    );

    expect(await screen.findByRole('img', { name: 'Ada Lovelace' })).toHaveTextContent('AL');
    expect(screen.queryByRole('img', { name: 'Ada Lovelace: аватар' })).not.toBeInTheDocument();
  });
});
