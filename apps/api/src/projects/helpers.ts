import { ConflictException, NotFoundException } from '@nestjs/common';

import { PurgeConfirmationRequiredError } from '../common/errors';
import { ProjectNotFoundError } from './errors';

/**
 * Перевод доменных ошибок проектов в HTTP. Живёт здесь, а не в сервисе: сервис и
 * репозиторий про HTTP не знают, а контроллер переводит одинаково во всех
 * маршрутах.
 *
 * `403` не используется: он отличал бы существующий чужой проект от
 * несуществующего. По той же причине удалённый проект отвечает тем же `404`, что
 * и несуществующий, — `ProjectNotFoundError` покрывает все три случая.
 */
export async function toHttpException<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      throw new NotFoundException(error.message);
    }

    if (error instanceof PurgeConfirmationRequiredError) {
      throw new ConflictException(error.toMessage());
    }

    throw error;
  }
}
