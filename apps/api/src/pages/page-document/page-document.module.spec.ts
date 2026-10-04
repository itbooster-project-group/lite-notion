import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { PageDocumentModule } from './page-document.module';
import { PageDocumentService } from './page-document.service';
import { PersistPageDocumentStateUseCase } from './use-cases/persist-page-document-state.use-case';

describe('PageDocumentModule', () => {
  it('exports the internal persistence use case alongside the read service', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, PageDocumentModule) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      PageDocumentModule,
    ) as unknown[];

    expect(exports).toContain(PersistPageDocumentStateUseCase);
    expect(providers).toContain(PersistPageDocumentStateUseCase);
    expect(exports).toContain(PageDocumentService);
  });
});
