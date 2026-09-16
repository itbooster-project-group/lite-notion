import { IsBase64, IsString, MaxLength } from 'class-validator';

import { DOCUMENT_MAX_BYTES } from '../../pages/constants';
import type { Bytes } from '../../pages/pages.repository';

/** Предел в символах base64: тело проверяется до декодирования. */
const BASE64_MAX_LENGTH = Math.ceil(DOCUMENT_MAX_BYTES / 3) * 4;

export class ReplaceInternalDocumentDto {
  // Пустая строка допустима: состояние только что созданного документа.
  @IsString()
  @IsBase64()
  @MaxLength(BASE64_MAX_LENGTH)
  yjsState!: string;
}

export class InternalDocumentDto {
  pageId!: string;
  yjsState!: string;

  static fromRecord(record: { pageId: string; yjsState: Bytes }): InternalDocumentDto {
    return {
      pageId: record.pageId,
      yjsState: Buffer.from(record.yjsState).toString('base64'),
    };
  }
}
