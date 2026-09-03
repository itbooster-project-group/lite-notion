import { ApiProperty, OmitType } from '@nestjs/swagger';

import { HttpErrorResponseDto } from '../../http-error-response.dto';

/**
 * Отличается от `HttpErrorResponseDto` одним: `message` — массив строк с причиной и
 * заголовками обречённых записей.
 *
 * Отдельный класс, а не `string | string[]` в общем DTO: объединение испортило бы
 * тип во всех остальных ответах клиента. `OmitType` — чтобы копия полей не разошлась.
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
