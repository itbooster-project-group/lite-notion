import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PurgeConfirmationRequiredError } from '../common/errors';
import { ProjectNotFoundError } from '../projects/errors';
import { POSITION_ALPHABET, POSITION_MAX_LENGTH } from './constants';
import {
  NextSiblingNotFoundError,
  PageCycleError,
  PageNotFoundError,
  PageParentNotFoundError,
  PageProjectMismatchError,
  PageRestoreProjectDeletedError,
  PageRestoreTargetProjectRejectedError,
  PreviousSiblingNotFoundError,
  SiblingOrderError,
  SiblingParentMismatchError,
} from './errors';

const ZERO = POSITION_ALPHABET.charAt(0);

/**
 * Строка строго между `lower` и `upper`; пустой `lower` — «от начала», `null` в
 * `upper` — «до конца».
 *
 * Ключ не заканчивается нулевым символом алфавита: между `a` и `a0` строки не
 * существует, и следующая вставка стала бы невозможной.
 */
function midpoint(lower: string, upper: string | null): string {
  if (upper !== null && lower >= upper) {
    throw new Error('Fractional rank bounds are not ordered');
  }

  if (lower.endsWith(ZERO) || upper?.endsWith(ZERO) === true) {
    throw new Error('Fractional rank must not end with the zero digit');
  }

  if (upper !== null) {
    // Общий префикс переносится в результат как есть, а середина ищется уже
    // между остатками. `lower` дополняется нулями: он может кончиться раньше.
    let shared = 0;

    while ((lower[shared] ?? ZERO) === upper[shared]) {
      shared += 1;
    }

    if (shared > 0) {
      return upper.slice(0, shared) + midpoint(lower.slice(shared), upper.slice(shared));
    }
  }

  const lowerDigit = lower === '' ? 0 : POSITION_ALPHABET.indexOf(lower.charAt(0));
  const upperDigit =
    upper === null ? POSITION_ALPHABET.length : POSITION_ALPHABET.indexOf(upper.charAt(0));

  if (upperDigit - lowerDigit > 1) {
    return POSITION_ALPHABET.charAt(Math.round(0.5 * (lowerDigit + upperDigit)));
  }

  // Разряды соседние: середины на этом разряде нет, приходится удлинять ключ.
  if (upper !== null && upper.length > 1) {
    return upper.slice(0, 1);
  }

  return POSITION_ALPHABET.charAt(lowerDigit) + midpoint(lower.slice(1), null);
}

function guardLength(position: string): string {
  if (position.length > POSITION_MAX_LENGTH) {
    throw new Error('Fractional rank exceeded the maximum stored length');
  }

  return position;
}

/**
 * Ранг для страницы, которая должна оказаться между двумя соседями.
 * `previous` — ранг соседа слева (`null`, если вставка в начало уровня),
 * `next` — ранг соседа справа (`null`, если вставка в конец уровня).
 */
export function positionBetween(previous: string | null, next: string | null): string {
  return guardLength(midpoint(previous ?? '', next));
}

/** Порядок братьев. Ранги не уникальны, поэтому `id` — детерминированный тай-брейк. */
export function compareSiblings(
  left: { id: string; position: string },
  right: { id: string; position: string },
): number {
  if (left.position !== right.position) {
    return left.position < right.position ? -1 : 1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? -1 : 1;
}

/**
 * Перевод доменных ошибок в HTTP: сервис и репозиторий про HTTP не знают, а оба
 * контроллера модуля переводят одинаково. `403` не используется нигде — он отличал
 * бы существующую чужую запись от несуществующей.
 */
export async function toHttpException<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof PageNotFoundError ||
      error instanceof ProjectNotFoundError ||
      error instanceof PageParentNotFoundError ||
      error instanceof PreviousSiblingNotFoundError ||
      error instanceof NextSiblingNotFoundError
    ) {
      throw new NotFoundException(error.message);
    }

    if (error instanceof PageCycleError || error instanceof PageRestoreProjectDeletedError) {
      throw new ConflictException(error.message);
    }

    if (error instanceof PurgeConfirmationRequiredError) {
      throw new ConflictException(error.toMessage());
    }

    if (
      error instanceof SiblingParentMismatchError ||
      error instanceof PageProjectMismatchError ||
      error instanceof PageRestoreTargetProjectRejectedError ||
      error instanceof SiblingOrderError
    ) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}
