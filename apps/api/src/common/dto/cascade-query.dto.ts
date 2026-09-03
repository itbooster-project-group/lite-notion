import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Подтверждение окончательного удаления. Отсутствие параметра означает «не
 * подтверждено»: безопасно по умолчанию, разрушительно по явному требованию.
 *
 * Query-параметры приходят строками, поэтому `true` разбирается вручную;
 * `class-transformer` иначе превратил бы в `true` любую непустую строку,
 * включая `cascade=false`.
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
