import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsInt, IsPositive, IsString, MaxLength } from 'class-validator';

import { DOCUMENT_MAX_BYTES } from '../../constants';
import type { PageDocumentRecord } from '../page-document.repository';

/**
 * Предел задаётся по длине base64-строки, а не по числу декодированных байтов:
 * строка приходит раньше декодирования, и проверять надо то, что уже в памяти.
 * base64 длиннее исходных данных на треть, поэтому предел с запасом накрывает
 * DOCUMENT_MAX_BYTES байт полезной нагрузки.
 */
const YJS_STATE_MAX_LENGTH = Math.ceil(DOCUMENT_MAX_BYTES / 3) * 4;

export class UpdatePageDocumentDto {
  @ApiProperty({
    description: 'Tiptap schema version the content conforms to.',
    example: 1,
    type: Number,
  })
  @IsInt()
  @IsPositive()
  tiptapSchemaVersion!: number;

  @ApiProperty({
    description: `Yjs document state, base64-encoded. Opaque to the API. Up to ${DOCUMENT_MAX_BYTES} bytes.`,
    example: '',
    format: 'byte',
    maxLength: YJS_STATE_MAX_LENGTH,
    type: String,
  })
  @IsString()
  @MaxLength(YJS_STATE_MAX_LENGTH)
  // Пустая строка — валидное состояние пустого документа, а `IsBase64` её
  // принимает, поэтому отдельного исключения не требуется.
  @IsBase64()
  yjsState!: string;
}

export class PageDocumentDto {
  @ApiProperty({ example: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  pageId!: string;

  @ApiProperty({ example: 1, type: Number })
  tiptapSchemaVersion!: number;

  @ApiProperty({
    description: 'Yjs document state, base64-encoded.',
    example: '',
    format: 'byte',
    type: String,
  })
  yjsState!: string;

  static fromRecord(document: PageDocumentRecord): PageDocumentDto {
    return {
      pageId: document.pageId,
      tiptapSchemaVersion: document.tiptapSchemaVersion,
      yjsState: Buffer.from(document.yjsState).toString('base64'),
    };
  }
}
