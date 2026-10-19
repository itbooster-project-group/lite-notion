import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/shared/api';
import { AssetUploadError } from '@/shared/api';
import { useImageAssetUpload } from './use-image-asset-upload';

const assetId = '22222222-2222-4222-8222-222222222222';
const readyAsset = {
  id: assetId,
  status: 'ready' as const,
  mimeType: 'image/png',
  sizeBytes: 3,
  originalName: 'image.png',
};

describe('useImageAssetUpload', () => {
  afterEach(() => vi.restoreAllMocks());

  it('confirms a 409 through page metadata and exposes ready only after confirmation', async () => {
    const initiate = vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId,
      contentPath: `/api/v1/assets/${assetId}/content`,
    });
    const put = vi
      .spyOn(api, 'uploadAssetContentWithProgress')
      .mockRejectedValue(new AssetUploadError('conflict', 409));
    const metadata = vi.spyOn(api, 'getAssetMetadata').mockResolvedValue(readyAsset);
    const { result } = renderHook(() => useImageAssetUpload());
    const file = new File(['png'], 'image.png', { type: 'image/png' });

    let resolvedAssetId: string | undefined;
    await act(async () => {
      resolvedAssetId = await result.current.upload(file, 'page-1');
    });

    expect(put).toHaveBeenCalledOnce();
    expect(metadata).toHaveBeenCalledWith(assetId, { pageId: 'page-1' });
    expect(resolvedAssetId).toBe(assetId);
    expect(result.current.status).toBe('ready');
    expect(result.current.canRetry).toBe(false);
    expect(initiate).toHaveBeenCalledOnce();
  });

  it('keeps an unconfirmed 409 unresolved and terminal', async () => {
    const initiate = vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId,
      contentPath: `/api/v1/assets/${assetId}/content`,
    });
    const put = vi
      .spyOn(api, 'uploadAssetContentWithProgress')
      .mockRejectedValue(new AssetUploadError('conflict', 409));
    const metadata = vi
      .spyOn(api, 'getAssetMetadata')
      .mockRejectedValue(Object.assign(new Error('not ready or unavailable'), { status: 401 }));
    const { result } = renderHook(() => useImageAssetUpload());
    const file = new File(['png'], 'image.png', { type: 'image/png' });

    await act(async () => {
      await result.current.upload(file, 'page-1');
    });
    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.status).toBe('unresolved');
    expect(result.current.canRetry).toBe(false);
    expect(result.current.canStartNew).toBe(false);
    expect(put).toHaveBeenCalledOnce();
    expect(metadata).toHaveBeenCalledOnce();
    expect(initiate).toHaveBeenCalledOnce();
  });

  it('does not retry a 409 after a new file is explicitly selected', async () => {
    const initiate = vi
      .spyOn(api, 'initiateAssetUpload')
      .mockResolvedValue({ assetId, contentPath: `/api/v1/assets/${assetId}/content` });
    const put = vi
      .spyOn(api, 'uploadAssetContentWithProgress')
      .mockRejectedValue(new AssetUploadError('conflict', 409));
    vi.spyOn(api, 'getAssetMetadata').mockRejectedValue(new Error('unavailable'));
    const { result } = renderHook(() => useImageAssetUpload());
    const firstFile = new File(['first'], 'first.png', { type: 'image/png' });
    const secondFile = new File(['second'], 'second.png', { type: 'image/png' });

    await act(async () => {
      await result.current.upload(firstFile, 'page-1');
    });
    act(() => {
      result.current.selectNewFile();
    });
    expect(result.current.canStartNew).toBe(true);
    await act(async () => {
      await result.current.upload(secondFile, 'page-1');
    });

    expect(initiate).toHaveBeenCalledTimes(2);
    expect(initiate.mock.calls.map(([body]) => body.fileName)).toEqual(['first.png', 'second.png']);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls.map(([, blob]) => blob)).toEqual([firstFile, secondFile]);
  });

  it('retries a repeatable error with the original asset ID and Blob', async () => {
    const initiate = vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId,
      contentPath: `/api/v1/assets/${assetId}/content`,
    });
    const put = vi
      .spyOn(api, 'uploadAssetContentWithProgress')
      .mockRejectedValueOnce(new AssetUploadError('temporary', 503))
      .mockResolvedValue(readyAsset);
    const { result } = renderHook(() => useImageAssetUpload());
    const file = new File(['same'], 'image.png', { type: 'image/png' });

    await act(async () => {
      await result.current.upload(file, 'page-1');
    });
    expect(result.current.canRetry).toBe(true);
    await act(async () => {
      await result.current.retry();
    });

    expect(put.mock.calls.map(([id, blob]) => [id, blob])).toEqual([
      [assetId, file],
      [assetId, file],
    ]);
    expect(initiate).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('ready');
  });

  it('blocks duplicate initiation while one upload action is active', async () => {
    const pending = Promise.withResolvers<{
      assetId: string;
      contentPath: string;
    }>();
    const initiate = vi.spyOn(api, 'initiateAssetUpload').mockReturnValue(pending.promise);
    vi.spyOn(api, 'uploadAssetContentWithProgress').mockResolvedValue(readyAsset);
    const { result } = renderHook(() => useImageAssetUpload());
    const file = new File(['same'], 'image.png', { type: 'image/png' });

    let first: Promise<string | undefined> | undefined;
    await act(async () => {
      first = result.current.upload(file, 'page-1');
      await result.current.upload(file, 'page-1');
    });
    expect(initiate).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('uploading');
    pending.resolve({ assetId, contentPath: `/api/v1/assets/${assetId}/content` });
    await act(async () => {
      await first;
    });
    expect(result.current.status).toBe('ready');
  });
});
