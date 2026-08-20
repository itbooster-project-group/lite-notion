export { apiFetch } from './api-fetch';

export async function startBrowserMocking() {
  const browserMocks = await import('./mocks/browser');

  return browserMocks.startBrowserMocking();
}
