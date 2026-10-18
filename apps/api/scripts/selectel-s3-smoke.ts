import { createHash, randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = required('ASSETS_S3_ENDPOINT');
const region = required('ASSETS_S3_REGION');
const bucket = required('ASSETS_S3_BUCKET');
const accessKeyId = required('ASSETS_S3_ACCESS_KEY_ID');
const secretAccessKey = required('ASSETS_S3_SECRET_ACCESS_KEY');
const prefix = required('ASSETS_S3_SMOKE_PREFIX');
if (!prefix.startsWith('assets-smoke/')) {
  throw new Error('ASSETS_S3_SMOKE_PREFIX must be isolated under assets-smoke/');
}

const client = new S3Client({
  credentials: { accessKeyId, secretAccessKey },
  endpoint,
  forcePathStyle: process.env.ASSETS_S3_FORCE_PATH_STYLE === 'true',
  maxAttempts: 2,
  region,
});
const key = `${prefix.replace(/\/+$/, '')}/${randomUUID()}/smoke.bin`;
const bytes = Buffer.from('lite-notion-selectel-s3-smoke');
const checksum = createChecksum(bytes);
let uploaded = false;

try {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Body: bytes,
      ContentLength: bytes.length,
      ContentType: 'application/octet-stream',
      Key: key,
      Metadata: { sha256: checksum },
    }),
  );
  uploaded = true;

  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.ContentLength !== bytes.length || head.Metadata?.sha256 !== checksum) {
    throw new Error('HeadObject metadata did not match the smoke object');
  }

  const signedUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 60,
  });
  const response = await fetch(signedUrl);
  const received = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !received.equals(bytes)) {
    throw new Error('Presigned GET did not return the original bytes');
  }

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  uploaded = false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    throw new Error('Object still exists after DeleteObject');
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  process.stdout.write(`Selectel S3 smoke test passed (${region}, ${endpoint})\n`);
} finally {
  if (uploaded) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
  }
  client.destroy();
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createChecksum(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  );
}
