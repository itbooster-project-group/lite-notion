import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { applicationConfig } from '../config/application-config';
import { PageNotFoundError } from '../pages/errors';
import { DocumentCaptureDto } from './dto/document-capture.dto';
import { DocumentCaptureUnavailableError } from './errors/document-capture-unavailable.error';

export interface CapturedDocumentState {
  yjsState: Uint8Array<ArrayBuffer>;
  storageRevision: bigint;
  tiptapSchemaVersion: number;
}

interface CaptureResponse {
  pageId: string;
  storageRevision: string;
  tiptapSchemaVersion: number;
  yjsState: string;
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

      return this.decodeCaptureResponse(await response.json(), pageId);
    } catch (error) {
      if (error instanceof PageNotFoundError || error instanceof DocumentCaptureUnavailableError) {
        throw error;
      }

      throw new DocumentCaptureUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }

  async decodeCaptureResponse(
    value: unknown,
    expectedPageId: string,
  ): Promise<CapturedDocumentState> {
    if (typeof value !== 'object' || value === null) {
      throw new DocumentCaptureUnavailableError();
    }

    const body = value as Partial<CaptureResponse>;

    const dto = plainToInstance(DocumentCaptureDto, body);
    const errors = await validate(dto);

    if (body.pageId !== expectedPageId || errors.length > 0) {
      throw new DocumentCaptureUnavailableError();
    }

    const decoded = Buffer.from(dto.yjsState, 'base64');

    if (decoded.toString('base64') !== body.yjsState) {
      throw new DocumentCaptureUnavailableError();
    }

    return {
      yjsState: new Uint8Array(decoded),
      storageRevision: BigInt(dto.storageRevision),
      tiptapSchemaVersion: dto.tiptapSchemaVersion,
    };
  }
}
