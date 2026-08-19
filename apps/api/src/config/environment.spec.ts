import { describe, expect, it } from 'vitest';

import { NodeEnvironment, validateEnvironment } from './environment';

const validEnvironment: Record<string, unknown> = {
  CORS_ORIGIN: 'https://notes.example.com',
  NODE_ENV: 'production',
  PORT: '4100',
};

describe('validateEnvironment', () => {
  it.each(['NODE_ENV', 'PORT', 'CORS_ORIGIN'])('отклоняет отсутствие %s', (property) => {
    const environment = { ...validEnvironment };
    delete environment[property];

    expect(() => validateEnvironment(environment)).toThrowError(
      new RegExp(`Environment validation failed: ${property}`),
    );
  });

  it('преобразует допустимую пользовательскую конфигурацию', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        UNRELATED_VALUE: 'preserved',
      }),
    ).toMatchObject({
      CORS_ORIGIN: 'https://notes.example.com',
      NODE_ENV: NodeEnvironment.Production,
      PORT: 4100,
      UNRELATED_VALUE: 'preserved',
    });
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['PORT', 'not-a-number'],
    ['PORT', '0'],
    ['PORT', '65536'],
    ['CORS_ORIGIN', 'ftp://localhost:3000'],
    ['CORS_ORIGIN', 'http://localhost:3000/path?token=secret'],
  ])('отклоняет невалидный %s', (property, value) => {
    expect(() => validateEnvironment({ ...validEnvironment, [property]: value })).toThrowError(
      new RegExp(`Environment validation failed: ${property}`),
    );
  });

  it('не раскрывает исходные значения в ошибке', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        CORS_ORIGIN: 'http://localhost:3000/path?token=secret-value',
      }),
    ).toThrowError(/^(?!.*secret-value).*Environment validation failed: CORS_ORIGIN/);
  });
});
