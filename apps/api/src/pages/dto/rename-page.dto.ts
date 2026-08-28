import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

import { TITLE_MAX_LENGTH } from '../constants';

/**
 * Только заголовок. Структурные поля сюда не попадают намеренно: глобальный
 * `forbidNonWhitelisted` отвечает `400` на попытку прислать ownerId, parentPageId
 * или position, поэтому изменить структуру переименованием нельзя.
 */
export class RenamePageDto {
  @ApiProperty({ example: 'Release notes', maxLength: TITLE_MAX_LENGTH, type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  title!: string;
}
