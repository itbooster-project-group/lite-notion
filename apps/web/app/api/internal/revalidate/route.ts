import { timingSafeEqual } from 'node:crypto';

const EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_PATH_PATTERN = /^\/p\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['api', 'login', 'register', 'profile', 'trash', 'projects']);

export async function POST(request: Request): Promise<Response> {
  const configuredToken = process.env.PUBLICATION_REVALIDATION_TOKEN;
  if (!configuredToken) return new Response(null, { status: 503 });

  const authorization = request.headers.get('authorization');
  if (!hasValidBearerToken(authorization, configuredToken)) {
    return new Response(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!isValidReceipt(payload)) return new Response(null, { status: 400 });
  return new Response(null, { status: 204 });
}

function hasValidBearerToken(authorization: string | null, expectedToken: string): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isValidReceipt(value: unknown): value is Readonly<{ eventId: string; paths: string[] }> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return (
    typeof receipt.eventId === 'string' &&
    EVENT_ID_PATTERN.test(receipt.eventId) &&
    Array.isArray(receipt.paths) &&
    receipt.paths.length > 0 &&
    receipt.paths.every((path) => isPublicationPath(path))
  );
}

function isPublicationPath(value: unknown): value is string {
  if (typeof value !== 'string' || !PUBLIC_PATH_PATTERN.test(value)) return false;
  return !RESERVED_SLUGS.has(value.slice('/p/'.length));
}
