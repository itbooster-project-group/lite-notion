import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { applicationConfig } from '../config/application-config';
import { PageNotFoundError } from '../pages/errors';
import type { CapturedDocumentState } from './captured-document-state';

export class DocumentCaptureUnavailableError extends Error {
  constructor() {
    super('Current document state is unavailable');
  }
}

interface CaptureResponse {
  pageId: string;
  storageRevision: string;
  tiptapSchemaVersion: number;
  yjsState: string;
}

function decodeCaptureResponse(value: unknown, expectedPageId: string): CapturedDocumentState {
  if (typeof value !== 'object' || value === null) {
    throw new DocumentCaptureUnavailableError();
  }

  const body = value as Partial<CaptureResponse>;

  if (
    body.pageId !== expectedPageId ||
    typeof body.storageRevision !== 'string' ||
    !/^(0|[1-9]\d*)$/.test(body.storageRevision) ||
    typeof body.tiptapSchemaVersion !== 'number' ||
    !Number.isInteger(body.tiptapSchemaVersion) ||
    body.tiptapSchemaVersion < 1 ||
    typeof body.yjsState !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.yjsState)
  ) {
    throw new DocumentCaptureUnavailableError();
  }

  const decoded = Buffer.from(body.yjsState, 'base64');

  if (decoded.toString('base64') !== body.yjsState) {
    throw new DocumentCaptureUnavailableError();
  }

  return {
    yjsState: new Uint8Array(decoded),
    storageRevision: BigInt(body.storageRevision),
    tiptapSchemaVersion: body.tiptapSchemaVersion,
  };
}

@Injectable()
export class DocumentCaptureClient {
  constructor(
    @Inject(applicationConfig.KEY)
    private readonly config: ConfigType<typeof applicationConfig>,
  ) {}

  async capture(pageId: string): Promise<CapturedDocumentState> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.collaborationTimeoutMs);

    try {
      const response = await fetch(
        `${this.config.collaborationBaseUrl}/internal/documents/${encodeURIComponent(pageId)}/capture`,
        {
          headers: { 'x-internal-service-token': this.config.internalServiceToken },
          method: 'POST',
          signal: controller.signal,
        },
      );

      if (response.status === 404) {
        throw new PageNotFoundError();
      }

      if (!response.ok) {
        throw new DocumentCaptureUnavailableError();
      }

      return decodeCaptureResponse(await response.json(), pageId);
    } catch (error) {
      if (error instanceof PageNotFoundError || error instanceof DocumentCaptureUnavailableError) {
        throw error;
      }

      throw new DocumentCaptureUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }
}
