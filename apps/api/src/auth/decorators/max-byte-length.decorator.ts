import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * Ограничивает строку в байтах UTF-8, а не в символах.
 *
 * `@MaxLength` считает UTF-16 code units, и для не-ASCII это не то же самое:
 * 40 символов кириллицы — 80 байт, 36 emoji — 144 байта. bcrypt обрезает вход
 * ровно на 72 байтах, поэтому проверка по символам пропускала бы пароли,
 * от которых до хеша доходит только часть.
 */
export function MaxByteLength(
  maxBytes: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxByteLength',
      validator: {
        defaultMessage: () => `$property must be shorter than or equal to ${maxBytes} UTF-8 bytes`,
        validate: (value: unknown) =>
          typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= maxBytes,
      },
    },
    validationOptions,
  );
}
