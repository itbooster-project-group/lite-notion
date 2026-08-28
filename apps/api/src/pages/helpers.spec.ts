import { describe, expect, it } from 'vitest';

import { POSITION_MAX_LENGTH } from './constants';
import { compareSiblings, positionBetween } from './helpers';

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
