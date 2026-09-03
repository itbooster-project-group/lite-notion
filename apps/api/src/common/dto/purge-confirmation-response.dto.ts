import { ApiProperty, OmitType } from '@nestjs/swagger';

import { HttpErrorResponseDto } from '../../http-error-response.dto';

/**
 * Тело отказа `409` от окончательного удаления. Отличается от
 * `HttpErrorResponseDto` ровно одним: `message` — массив строк, потому что
 * `PurgeConfirmationRequiredError` кладёт туда причину первой строкой и дальше
 * заголовки обречённых записей.
 *
 * Отдельный класс, а не `message: string | string[]` в общем DTO: перечень
 * обещан только этим трём endpoint'ам, и объединение испортило бы тип во всех
 * остальных ответах сгенерированного клиента.
 *
 * `OmitType`, а не переписанные заново поля: остальные четыре обязаны совпадать
 * с общим DTO, и копия разошлась бы с ним при первом же изменении.
 */
export class PurgeConfirmationResponseDto extends OmitType(HttpErrorResponseDto, [
  'message',
] as const) {
  @ApiProperty({
    example: ['Confirm the deletion: these trash entries will be destroyed as well', 'Архив 2024'],
    isArray: true,
    type: String,
  })
  message!: string[];
}
