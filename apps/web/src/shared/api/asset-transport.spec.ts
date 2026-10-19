import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetUploadError, uploadAssetContentWithProgress } from './asset-transport';
import { configureAuthTransport, setAccessToken } from './auth-session';

class FakeXMLHttpRequest extends EventTarget {
  static requests: FakeXMLHttpRequest[] = [];
  upload = new EventTarget();
  status = 200;
  responseText = '';
  withCredentials = false;
  headers = new Map<string, string>();
  sentBlob?: Blob;
  url = '';

  constructor() {
    super();
    FakeXMLHttpRequest.requests.push(this);
  }

  open(_method: string, url: string | URL) {
    this.url = String(url);
  }

  setRequestHeader(key: string, value: string) {
    this.headers.set(key, value);
  }

  send(blob: Blob) {
    this.sentBlob = blob;
  }

  respond(status: number, response: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(response);
    this.dispatchEvent(new Event('load'));
  }

  failNetwork() {
    this.dispatchEvent(new Event('error'));
  }
}

const assetId = '33333333-3333-4333-8333-333333333333';
const readyAsset = {
  id: assetId,
  status: 'ready' as const,
  mimeType: 'image/png',
  sizeBytes: 3,
  originalName: 'image.png',
};

describe('uploadAssetContentWithProgress', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    FakeXMLHttpRequest.requests = [];
    vi.unstubAllGlobals();
  });

  it('reports progress and uploads one raw Blob to the requested asset', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const blob = new Blob(['png'], { type: 'image/png' });
    const progress = vi.fn();
    const pending = uploadAssetContentWithProgress(assetId, blob, progress);
    const request = FakeXMLHttpRequest.requests[0];
    request?.upload.dispatchEvent(
      Object.assign(new Event('progress'), { loaded: 2, total: 3, lengthComputable: true }),
    );
    request?.respond(200, readyAsset);

    await expect(pending).resolves.toEqual(readyAsset);
    expect(progress).toHaveBeenCalledWith({ loaded: 2, total: 3 });
    expect(request?.url).toContain(`/assets/${assetId}/content`);
    expect(request?.sentBlob).toBe(blob);
    expect(request?.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('replays the same Blob once after 401 through the existing auth refresh', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    setAccessToken('old-token');
    const refresh = vi.fn(async () => 'new-token');
    cleanups.push(
      configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired: vi.fn() }),
    );
    const blob = new Blob(['same']);
    const pending = uploadAssetContentWithProgress(assetId, blob, vi.fn());
    FakeXMLHttpRequest.requests[0]?.respond(401, {});
    await vi.waitFor(() => expect(FakeXMLHttpRequest.requests).toHaveLength(2));
    FakeXMLHttpRequest.requests[1]?.respond(200, readyAsset);

    await expect(pending).resolves.toEqual(readyAsset);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeXMLHttpRequest.requests.map(({ sentBlob }) => sentBlob)).toEqual([blob, blob]);
    expect(FakeXMLHttpRequest.requests[1]?.headers.get('Authorization')).toBe('Bearer new-token');
  });

  it('does not treat 409 or a network failure as successful upload', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const conflict = uploadAssetContentWithProgress(assetId, new Blob(['x']), vi.fn());
    FakeXMLHttpRequest.requests[0]?.respond(409, {});
    await expect(conflict).rejects.toMatchObject({ status: 409 });

    const ambiguous = uploadAssetContentWithProgress(assetId, new Blob(['x']), vi.fn());
    FakeXMLHttpRequest.requests[1]?.failNetwork();
    await expect(ambiguous).rejects.toBeInstanceOf(AssetUploadError);
    await expect(ambiguous).rejects.toMatchObject({ ambiguous: true });
  });

  it('does not retry 403 and stops after one replayed 401', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const refresh = vi.fn(async () => 'new-token');
    const expired = vi.fn();
    cleanups.push(
      configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired: expired }),
    );
    const denied = uploadAssetContentWithProgress(assetId, new Blob(['x']), vi.fn());
    FakeXMLHttpRequest.requests[0]?.respond(403, {});
    await expect(denied).rejects.toMatchObject({ status: 403 });
    expect(refresh).not.toHaveBeenCalled();

    const repeated = uploadAssetContentWithProgress(assetId, new Blob(['same']), vi.fn());
    FakeXMLHttpRequest.requests[1]?.respond(401, {});
    await vi.waitFor(() => expect(FakeXMLHttpRequest.requests).toHaveLength(3));
    FakeXMLHttpRequest.requests[2]?.respond(401, {});
    await expect(repeated).rejects.toMatchObject({ status: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledOnce();
    expect(FakeXMLHttpRequest.requests).toHaveLength(3);
  });

  it('does not replay the upload when the auth refresh itself fails', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const refreshError = Object.assign(new Error('expired'), { status: 401 });
    const refresh = vi.fn(async () => {
      throw refreshError;
    });
    const expired = vi.fn();
    cleanups.push(
      configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired: expired }),
    );
    const pending = uploadAssetContentWithProgress(assetId, new Blob(['same']), vi.fn());
    FakeXMLHttpRequest.requests[0]?.respond(401, {});

    await expect(pending).rejects.toBe(refreshError);
    expect(refresh).toHaveBeenCalledOnce();
    expect(expired).toHaveBeenCalledOnce();
    expect(FakeXMLHttpRequest.requests).toHaveLength(1);
  });
});
