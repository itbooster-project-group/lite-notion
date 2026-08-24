import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Собирается из claims access-токена без обращения к базе. Полей профиля здесь
 * намеренно нет: они нужны только `GET /auth/me`, который загружает их сам.
 */
export interface AuthenticatedUser {
  id: string;
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);
