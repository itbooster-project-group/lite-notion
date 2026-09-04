import { ConflictException, NotFoundException } from '@nestjs/common';

import { PurgeConfirmationRequiredError } from '../common/errors';
import { ProjectNotFoundError } from './errors';

/**
 * Перевод доменных ошибок в HTTP: сервис и репозиторий про HTTP не знают. `403` не
 * используется — он отличал бы чужой проект от несуществующего; удалённый отвечает
 * тем же `404`.
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
