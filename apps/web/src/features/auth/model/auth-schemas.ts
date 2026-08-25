import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Введите корректный email'));

const passwordByteLimit = z.string().refine((value) => utf8ByteLength(value) <= 72, {
  message: 'Пароль должен занимать не более 72 байт',
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordByteLimit.min(1, 'Введите пароль'),
});

export const registerSchema = z
  .object({
    confirmPassword: z.string().min(1, 'Повторите пароль'),
    email: emailSchema,
    name: z.string().trim().min(1, 'Введите имя').max(64, 'Имя должно быть не длиннее 64 символов'),
    password: passwordByteLimit.min(8, 'Пароль должен содержать не менее 8 символов'),
  })
  .refine(({ confirmPassword, password }) => confirmPassword === password, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
