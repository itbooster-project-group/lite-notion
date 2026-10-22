import { ApiProperty } from '@nestjs/swagger';

export class SearchResultDto {
  @ApiProperty({ format: 'uuid', type: String })
  pageId!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  snippet!: string | null;
}
