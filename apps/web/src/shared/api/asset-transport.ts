import {
  canRefreshAccessToken,
  expireSession,
  getAuthStateSnapshot,
  isAuthStateCurrent,
  refreshAccessToken,
} from './auth-session';
import type { AssetResponseDto } from './generated/model';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export const assetReadUrlQueryKey = ['asset-read-url'] as const;

export function getAssetReadUrlQueryKey(
  assetId: string,
  authorizationContext: string,
  ownerId: string,
) {
  return [...assetReadUrlQueryKey, assetId, authorizationContext, ownerId] as const;
}

export class AssetUploadError extends Error {
  override readonly name = 'AssetUploadError';

  constructor(
    message: string,
    readonly status?: number,
    readonly ambiguous = false,
  ) {
    super(message);
  }
}

export type AssetUploadProgress = Readonly<{ loaded: number; total: number }>;

export function uploadAssetContentWithProgress(
  assetId: string,
  blob: Blob,
  onProgress: (progress: AssetUploadProgress) => void,
): Promise<AssetResponseDto> {
  const requestState = getAuthStateSnapshot();
  return sendUpload(assetId, blob, onProgress, requestState).catch(async (error: unknown) => {
    if (!(error instanceof AssetUploadError) || error.status !== 401 || !canRefreshAccessToken()) {
      throw error;
    }

    if (isAuthStateCurrent(requestState)) await refreshAccessToken();
    const retryState = getAuthStateSnapshot();

    try {
      return await sendUpload(assetId, blob, onProgress, retryState);
    } catch (retryError) {
      if (retryError instanceof AssetUploadError && retryError.status === 401) {
        expireSession(retryState);
      }
      throw retryError;
    }
  });
}

function sendUpload(
  assetId: string,
  blob: Blob,
  onProgress: (progress: AssetUploadProgress) => void,
  auth: ReturnType<typeof getAuthStateSnapshot>,
): Promise<AssetResponseDto> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', new URL(`/api/v1/assets/${assetId}/content`, apiBaseUrl));
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    if (auth.accessToken) request.setRequestHeader('Authorization', `Bearer ${auth.accessToken}`);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress({ loaded: event.loaded, total: event.total });
    });
    request.addEventListener('load', () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new AssetUploadError(`Upload failed with status ${request.status}`, request.status));
        return;
      }
      try {
        const response: AssetResponseDto = JSON.parse(request.responseText);
        if (response.id !== assetId || response.status !== 'ready') {
          reject(new AssetUploadError('The server did not confirm a ready asset.', 409));
          return;
        }
        resolve(response);
      } catch {
        reject(new AssetUploadError('Upload returned an invalid response.'));
      }
    });
    request.addEventListener('error', () => {
      reject(
        new AssetUploadError(
          'Upload result is unknown. Retry this asset to confirm its state.',
          undefined,
          true,
        ),
      );
    });
    request.addEventListener('abort', () => {
      reject(
        new AssetUploadError('Upload was interrupted; its result may be unknown.', undefined, true),
      );
    });
    request.send(blob);
  });
}
