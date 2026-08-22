import { type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import { JWT_STRATEGY_NAME } from './jwt.strategy';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY_NAME) {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Причина отклонения наружу не уходит: истёкший, подделанный и отсутствующий
   * токен дают один и тот же ответ.
   */
  handleRequest<TUser>(error: unknown, user: TUser | false): TUser {
    if (error !== null || user === false) {
      throw new UnauthorizedException('Unauthorized');
    }

    return user;
  }
}
