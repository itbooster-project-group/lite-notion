import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { applicationConfig } from '../../config/application-config';
import { INTERNAL_SERVICE_TOKEN_HEADER } from '../constants';

/** Допуск к операциям без пользователя в скоупе: отложенный flush токен предъявить не может. */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(
    @Inject(applicationConfig.KEY) private readonly config: ConfigType<typeof applicationConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const presented = request.headers[INTERNAL_SERVICE_TOKEN_HEADER];

    if (typeof presented !== 'string' || !this.matches(presented)) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }

  /** Длины сверяются до `timingSafeEqual`: на разной длине он бросает. */
  private matches(presented: string): boolean {
    const expected = Buffer.from(this.config.internalServiceToken, 'utf8');
    const actual = Buffer.from(presented, 'utf8');

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
