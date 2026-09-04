import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Отсутствие параметра означает «не подтверждено». `true` разбирается вручную:
 * `class-transformer` превратил бы в `true` любую непустую строку, включая `false`.
 */
export class CascadeQueryDto {
  @ApiPropertyOptional({
    description:
      'Confirms destroying trash entries that the trash listing showed outside the target.',
    type: Boolean,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsOptional()
  @IsBoolean()
  cascade?: boolean;
}
