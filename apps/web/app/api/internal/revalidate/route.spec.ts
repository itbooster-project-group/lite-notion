import { afterEach, describe, expect, it } from 'vitest';
import { POST } from './route';

const token = 'local-test-token';
const body = {
  eventId: '8be3ed8b-62b7-4e82-90b2-41cab8000001',
  paths: ['/p/old-slug', '/p/new-slug'],
};

const previousToken = process.env.PUBLICATION_REVALIDATION_TOKEN;

afterEach(() => {
  if (previousToken === undefined) delete process.env.PUBLICATION_REVALIDATION_TOKEN;
  else process.env.PUBLICATION_REVALIDATION_TOKEN = previousToken;
});

describe('publication outbox receipt', () => {
  it('acknowledges valid and duplicate deliveries without using request Host', async () => {
    process.env.PUBLICATION_REVALIDATION_TOKEN = token;
    const request = () =>
      new Request('https://untrusted.example/api/internal/revalidate', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    expect((await POST(request())).status).toBe(204);
    expect((await POST(request())).status).toBe(204);
  });

  it('rejects missing configuration and invalid authorization or paths', async () => {
    delete process.env.PUBLICATION_REVALIDATION_TOKEN;
    expect((await POST(new Request('https://example.test', { method: 'POST' }))).status).toBe(503);

    process.env.PUBLICATION_REVALIDATION_TOKEN = token;
    const invalidToken = new Request('https://example.test', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
      body: JSON.stringify(body),
    });
    expect((await POST(invalidToken)).status).toBe(401);

    const invalidPath = new Request('https://example.test', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, paths: ['/p/valid', '/p/login'] }),
    });
    expect((await POST(invalidPath)).status).toBe(400);
  });
});
