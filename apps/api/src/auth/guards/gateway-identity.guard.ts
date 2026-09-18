import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import {
  INTERNAL_IDENTITY_SESSION_HEADER,
  INTERNAL_IDENTITY_USER_HEADER,
} from '../../internal/constants';

interface RequestWithIdentity {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Личность приходит от шлюза заголовками: токен проверен до того, как запрос
 * дошёл сюда. Доверие к заголовкам держится на том, что API недостижим мимо
 * шлюза, а шлюз затирает их клиентские копии на входе.
 *
 * Отсутствие заголовков означает запрос в обход шлюза и даёт `401`.
 */
@Injectable()
export class GatewayIdentityGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    const id = single(request.headers[INTERNAL_IDENTITY_USER_HEADER]);
    const sessionId = single(request.headers[INTERNAL_IDENTITY_SESSION_HEADER]);

    if (id === undefined || sessionId === undefined) {
      throw new UnauthorizedException('Unauthorized');
    }

    request.user = { id, sessionId };

    return true;
  }
}
