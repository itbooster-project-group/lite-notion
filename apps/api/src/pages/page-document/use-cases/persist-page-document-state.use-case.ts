import { Inject, Injectable } from '@nestjs/common';
import { PageNotFoundError } from '../../errors';
import type { Bytes } from '../../pages.repository';
import { type PageDocumentRecord, PageDocumentRepository } from '../page-document.repository';

@Injectable()
export class PersistPageDocumentStateUseCase {
  constructor(@Inject(PageDocumentRepository) private readonly documents: PageDocumentRepository) {}

  async execute(pageId: string, yjsState: Bytes): Promise<PageDocumentRecord> {
    const document = await this.documents.replaceYjsState(pageId, yjsState);

    if (document === null) {
      throw new PageNotFoundError();
    }

    return document;
  }
}
