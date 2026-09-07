import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Принимается только когда собственный проект страницы в корзине: иначе
 * восстановление стало бы обходом запрета на перенос между проектами.
 */
export class RestorePageDto {
  @ApiPropertyOptional({
    description:
      'Live project to restore the page into. Accepted only when the page own project is in the trash.',
    format: 'uuid',
    type: String,
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
