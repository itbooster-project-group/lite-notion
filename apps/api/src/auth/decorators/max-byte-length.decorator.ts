import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * Ограничивает строку в байтах UTF-8: `@MaxLength` считает UTF-16 code units, а
 * bcrypt обрезает вход ровно на 72 байтах. 40 символов кириллицы — 80 байт.
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
