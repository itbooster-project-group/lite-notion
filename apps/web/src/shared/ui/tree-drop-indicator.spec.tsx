import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TreeDropIndicator } from '@/shared/ui';

afterEach(cleanup);

describe('TreeDropIndicator', () => {
  it('renders hidden when there is no active drag line', () => {
    const view = render(<TreeDropIndicator style={{ display: 'none' }} />);
    const line = view.container.firstElementChild;
    expect(line).toHaveStyle({ display: 'none' });
  });

  it('renders a positioned line for an active drag line', () => {
    const view = render(
      <TreeDropIndicator
        style={{ left: '24px', pointerEvents: 'none', position: 'absolute', top: '10px' }}
      />,
    );
    const line = view.container.firstElementChild;
    expect(line).toHaveStyle({ left: '24px', position: 'absolute', top: '10px' });
  });
});
