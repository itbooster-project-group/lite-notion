import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Маршруты закрыты по умолчанию, публичные помечаются явно. Обратный вариант —
 * помечать приватные — при той же забывчивости открывал бы маршрут наружу,
 * тогда как забытый `@Public()` даёт заметный `401`.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
