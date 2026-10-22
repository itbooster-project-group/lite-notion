import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ maxLength: 200, type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  query!: string;

  @ApiPropertyOptional({ default: 20, maximum: 50, minimum: 1, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
