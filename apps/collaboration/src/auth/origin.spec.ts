import { describe, expect, it } from 'vitest';

import { assertAllowedOrigin, OriginValidationError } from './origin.js';

describe('assertAllowedOrigin', () => {
  it('принимает exact allowed origin', () => {
    expect(() =>
      assertAllowedOrigin(
        new Headers({ origin: 'http://localhost:3000' }),
        'http://localhost:3000',
      ),
    ).not.toThrow();
  });

  it('отклоняет missing origin', () => {
    expect(() => assertAllowedOrigin(new Headers(), 'http://localhost:3000')).toThrow(
      OriginValidationError,
    );
  });

  it('отклоняет mismatched origin', () => {
    expect(() =>
      assertAllowedOrigin(new Headers({ origin: 'http://evil.example' }), 'http://localhost:3000'),
    ).toThrow(OriginValidationError);
  });
});
