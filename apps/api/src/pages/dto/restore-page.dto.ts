import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Проект, в который восстанавливается страница из удалённого проекта.
 *
 * Принимается только когда собственный проект страницы лежит в корзине: иначе
 * восстановление стало бы обходным путём для переноса между проектами, который
 * закрыт требованием в `specs/page-tree`.
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
