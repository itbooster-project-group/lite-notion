import type { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { POSITION_MAX_LENGTH } from './constants';
import { PageNotFoundError, PageRoleInsufficientError } from './errors';
import { compareSiblings, positionBetween, toHttpException } from './helpers';

describe('positionBetween', () => {
  it('даёт ранг для пустого уровня', () => {
    expect(positionBetween(null, null)).toBe('V');
  });

  it('даёт ранг строго между двумя соседями', () => {
    const previous = positionBetween(null, null);
    const next = positionBetween(previous, null);

    const middle = positionBetween(previous, next);

    expect(previous < middle).toBe(true);
    expect(middle < next).toBe(true);
  });

  it('даёт ранг перед первым элементом', () => {
    const first = positionBetween(null, null);

    expect(positionBetween(null, first) < first).toBe(true);
  });

  it('даёт ранг после последнего элемента', () => {
    const last = positionBetween(null, null);

    expect(positionBetween(last, null) > last).toBe(true);
  });

  it('удлиняет ключ между соседними по алфавиту рангами', () => {
    expect(positionBetween('a', 'b')).toBe('aV');
  });

  it('отклоняет неупорядоченные границы', () => {
    expect(() => positionBetween('b', 'a')).toThrow();
    expect(() => positionBetween('a', 'a')).toThrow();
  });

  it('отклоняет границу с хвостовым нулём', () => {
    // Между `a0` и `a` нет строки, поэтому такой ранг сломал бы следующую вставку.
    expect(() => positionBetween('a0', null)).toThrow();
  });

  it('сохраняет строгий порядок при ста вставках в одну щель', () => {
    const lower = positionBetween(null, null);
    let upper = positionBetween(lower, null);
    const generated: string[] = [];

    for (let insertion = 0; insertion < 100; insertion += 1) {
      upper = positionBetween(lower, upper);
      generated.push(upper);
    }

    for (const position of generated) {
      expect(position > lower).toBe(true);
      expect(position.length).toBeLessThanOrEqual(POSITION_MAX_LENGTH);
    }

    // Каждая следующая вставка ложится строго левее предыдущей.
    const descending = [...generated].sort().reverse();

    expect(generated).toEqual(descending);
  });

  it('сохраняет строгий порядок при ста добавлениях в конец', () => {
    let last = positionBetween(null, null);
    const generated = [last];

    for (let insertion = 0; insertion < 100; insertion += 1) {
      last = positionBetween(last, null);
      generated.push(last);
    }

    expect(generated).toEqual([...generated].sort());
    expect(last.length).toBeLessThanOrEqual(POSITION_MAX_LENGTH);
  });
});

describe('compareSiblings', () => {
  it('упорядочивает по рангу', () => {
    expect(compareSiblings({ id: 'b', position: 'a' }, { id: 'a', position: 'b' })).toBeLessThan(0);
  });

  it('разрешает совпадающие ранги по id детерминированно', () => {
    const left = { id: 'aaaa', position: 'V' };
    const right = { id: 'bbbb', position: 'V' };

    expect(compareSiblings(left, right)).toBeLessThan(0);
    expect(compareSiblings(right, left)).toBeGreaterThan(0);
  });

  it('считает страницу равной самой себе', () => {
    const page = { id: 'aaaa', position: 'V' };

    expect(compareSiblings(page, page)).toBe(0);
  });
});

describe('toHttpException', () => {
  async function statusOf(error: Error): Promise<number> {
    try {
      await toHttpException(() => Promise.reject(error));
    } catch (thrown) {
      return (thrown as HttpException).getStatus();
    }

    throw new Error('Expected an HTTP exception');
  }

  it('переводит нехватку роли в 403', async () => {
    await expect(statusOf(new PageRoleInsufficientError())).resolves.toBe(403);
  });

  it('оставляет отсутствие страницы 404 с прежним телом', async () => {
    const error = new PageNotFoundError();

    await expect(statusOf(error)).resolves.toBe(404);
    await expect(
      toHttpException(() => Promise.reject(error)).catch((thrown: HttpException) =>
        thrown.getResponse(),
      ),
    ).resolves.toMatchObject({ message: 'Page not found' });
  });

  /**
   * `403` и `404` обязаны оставаться разными ответами: первый говорит «страница есть,
   * роли мало», второй — «страницы для тебя не существует».
   */
  it('различает нехватку роли и отсутствие доступа', async () => {
    const forbidden = await statusOf(new PageRoleInsufficientError());
    const notFound = await statusOf(new PageNotFoundError());

    expect(forbidden).not.toBe(notFound);
  });

  it('пропускает не-доменные ошибки как есть', async () => {
    const error = new Error('boom');

    await expect(toHttpException(() => Promise.reject(error))).rejects.toBe(error);
  });
});
