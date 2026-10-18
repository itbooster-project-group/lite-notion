import { Inject, Injectable } from '@nestjs/common';
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
    const document = await this.documents.replaceYjsState(
      pageId,
      yjsState,
      expectedStorageRevision,
      tiptapSchemaVersion,
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
