import { Inject, Injectable } from '@nestjs/common';
import { TIPTAP_SCHEMA_VERSION } from '../../../database/constants';
import { PageNotFoundError } from '../../errors';
import type { Bytes } from '../../pages.repository';
import { type PageDocumentRecord, PageDocumentRepository } from '../page-document.repository';
import { ProjectPageAssetsUseCase } from './project-page-assets.use-case';

@Injectable()
export class PersistPageDocumentStateUseCase {
  constructor(
    @Inject(PageDocumentRepository) private readonly documents: PageDocumentRepository,
    @Inject(ProjectPageAssetsUseCase) private readonly projection: ProjectPageAssetsUseCase,
  ) {}

  async execute(
    pageId: string,
    yjsState: Bytes,
    expectedStorageRevision: bigint,
    tiptapSchemaVersion: number,
  ): Promise<{ accepted: boolean; document: PageDocumentRecord }> {
    const persistedSchemaVersion = Math.max(tiptapSchemaVersion, TIPTAP_SCHEMA_VERSION);
    const document = await this.documents.replaceYjsState(
      pageId,
      yjsState,
      expectedStorageRevision,
      persistedSchemaVersion,
    );

    if (document === null) {
      const current = await this.documents.find(pageId);
      if (current === null) throw new PageNotFoundError();
      return { accepted: false, document: current };
    }

    await this.projection.execute(document);

    return { accepted: true, document };
  }
}
