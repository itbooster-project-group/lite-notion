import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageDocumentPresence, PresenceUser } from '../model/page-document-session';
import { Participants } from './participants';

afterEach(cleanup);

function createPresence(users: readonly PresenceUser[]): PageDocumentPresence {
  return {
    users,
    subscribe: vi.fn(() => vi.fn()),
  };
}

describe('Participants', () => {
  it('shows initials, accessible names, colors and overflow', () => {
    const users = Array.from({ length: 6 }, (_, index) => ({
      id: `user-${index}`,
      name: `User ${index}`,
      color: '#2563eb',
    }));

    render(<Participants presence={createPresence(users)} />);

    expect(screen.getByRole('list', { name: 'Участники документа' })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^User [0-4]$/)).toHaveLength(5);
    expect(screen.getByLabelText('Ещё 1 участников')).toBeInTheDocument();
    expect(screen.queryByLabelText('User 5')).not.toBeInTheDocument();
  });

  it('subscribes to the domain presence contract without receiving a provider', () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const presence = { users: [], subscribe } satisfies PageDocumentPresence;

    const view = render(<Participants presence={presence} />);
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

    render(<Participants presence={presence} />);
    expect(screen.getByLabelText('Ada Lovelace')).toBeInTheDocument();

    users = [{ id: 'user-b', name: 'Bob', color: '#16a34a' }];
    act(() => notify());

    expect(screen.queryByLabelText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Bob')).toBeInTheDocument();
  });
});
