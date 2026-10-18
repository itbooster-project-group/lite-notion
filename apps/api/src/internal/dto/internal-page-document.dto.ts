import { IsBase64, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { DOCUMENT_MAX_BYTES } from '../../pages/constants';
import type { PageDocumentRecord } from '../../pages/page-document/page-document.repository';

/** Предел в символах base64: тело проверяется до декодирования. */
const BASE64_MAX_LENGTH = Math.ceil(DOCUMENT_MAX_BYTES / 3) * 4;

export class ReplaceInternalDocumentDto {
  // Пустая строка допустима: состояние только что созданного документа.
  @IsString()
  @IsBase64()
  @MaxLength(BASE64_MAX_LENGTH)
  yjsState!: string;

  @IsString()
  @Matches(/^\d+$/)
  expectedStorageRevision!: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  tiptapSchemaVersion!: number;
}

export class InternalDocumentDto {
  accepted?: boolean;
  pageId!: string;
  storageRevision!: string;
  tiptapSchemaVersion!: number;
  yjsState!: string;

  static fromRecord(record: PageDocumentRecord): InternalDocumentDto {
    return {
      pageId: record.pageId,
      storageRevision: record.storageRevision.toString(),
      tiptapSchemaVersion: record.tiptapSchemaVersion,
      yjsState: Buffer.from(record.yjsState).toString('base64'),
    };
  }

  static fromWriteResult(result: {
    accepted: boolean;
    document: PageDocumentRecord;
  }): InternalDocumentDto {
    return { ...InternalDocumentDto.fromRecord(result.document), accepted: result.accepted };
  }
}
