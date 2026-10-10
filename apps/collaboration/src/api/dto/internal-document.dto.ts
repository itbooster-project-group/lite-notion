import { IsBase64, IsInt, IsString, Matches, Min } from 'class-validator';

export class InternalDocumentDto {
  @IsString()
  pageId!: string;

  @IsString()
  @Matches(/^(0|[1-9]\d*)$/)
  storageRevision!: string;

  @IsInt()
  @Min(1)
  tiptapSchemaVersion!: number;

  @IsBase64()
  yjsState!: string;
}
