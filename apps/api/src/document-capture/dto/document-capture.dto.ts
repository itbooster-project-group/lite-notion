import { IsBase64, IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';

export class DocumentCaptureDto {
  @IsString()
  @IsNotEmpty()
  pageId!: string;

  @IsString()
  @Matches(/^(0|[1-9]\d*)$/)
  storageRevision!: string;

  @IsInt()
  @Min(1)
  tiptapSchemaVersion!: number;

  @IsString()
  @IsBase64()
  yjsState!: string;
}
