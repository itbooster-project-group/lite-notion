import { setupWorker } from 'msw/browser';

import { handlers } from './handlers';

const worker = setupWorker(...handlers);
let startPromise: ReturnType<typeof worker.start> | undefined;

export function startBrowserMocking(): ReturnType<typeof worker.start> {
  const pendingStart = startPromise ?? worker.start({ onUnhandledRequest: 'bypass' });
  startPromise = pendingStart;

  return pendingStart;
}
