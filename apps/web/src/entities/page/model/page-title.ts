import { z } from 'zod';

export const pageTitleSchema = z
  .string()
  .trim()
  .min(1, 'Введите название страницы')
  .max(255, 'Название может содержать до 255 символов');

export function parsePageTitle(value: string): { error?: string; title?: string } {
  const result = pageTitleSchema.safeParse(value);
  return result.success
    ? { title: result.data }
    : { error: result.error.issues[0]?.message ?? 'Некорректное название' };
}
