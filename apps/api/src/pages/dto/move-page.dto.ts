import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/**
 * Ранг сервер считает сам: клиент называет соседей, между которыми должна
 * оказаться страница. Принимать position от клиента значило бы позволить ему
 * сломать монотонность уровня.
 */
export class MovePageDto {
  @ApiPropertyOptional({
    description: 'New parent. Omit or send null to move the page to the tree root.',
    format: 'uuid',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  parentPageId?: string | null;

  @ApiPropertyOptional({
    description: 'Page the moved page must follow among its new siblings.',
    format: 'uuid',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  previousSiblingId?: string | null;

  @ApiPropertyOptional({
    description: 'Page the moved page must precede among its new siblings.',
    format: 'uuid',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  nextSiblingId?: string | null;
}
