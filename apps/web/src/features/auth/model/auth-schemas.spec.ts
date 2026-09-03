import { describe, expect, it } from 'vitest';

import { loginSchema, registerSchema } from './auth-schemas';

const validRegistration = {
  confirmPassword: 'password-123',
  email: 'ada@example.com',
  name: 'Ada',
  password: 'password-123',
};

describe('auth schemas', () => {
  it('нормализует email и обрезает имя', () => {
    expect(
      registerSchema.parse({ ...validRegistration, email: ' ADA@EXAMPLE.COM ', name: ' Ada ' }),
    ).toMatchObject({ email: 'ada@example.com', name: 'Ada' });
  });

  it('отклоняет короткий пароль регистрации', () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      confirmPassword: '1234567',
      password: '1234567',
    });

    expect(result.success).toBe(false);
  });

  it('принимает пароль ровно в 72 UTF-8 байта', () => {
    const password = 'я'.repeat(36);

    expect(
      registerSchema.safeParse({ ...validRegistration, confirmPassword: password, password })
        .success,
    ).toBe(true);
  });

  it('отклоняет пароль длиннее 72 UTF-8 байт', () => {
    const password = 'я'.repeat(37);

    expect(
      registerSchema.safeParse({ ...validRegistration, confirmPassword: password, password })
        .success,
    ).toBe(false);
    expect(loginSchema.safeParse({ email: 'ada@example.com', password }).success).toBe(false);
  });

  it('показывает ошибку подтверждения только у confirmation', () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      confirmPassword: 'different-password',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['confirmPassword'] })]),
      );
    }
  });
});
