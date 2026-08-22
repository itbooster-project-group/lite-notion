import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { type ApplicationConfig, applicationConfig } from '../config/application-config';
import type { AuthenticatedUser } from './current-user.decorator';
import type { AccessTokenPayload } from './token.service';

export const JWT_STRATEGY_NAME = 'jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(@Inject(applicationConfig.KEY) config: ApplicationConfig) {
    super({
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwtSecret,
    });
  }

  /**
   * Вызывается только после успешной проверки подписи и `exp`. База здесь не
   * читается: устаревание токена относительно состояния учётной записи
   * ограничено сверху ACCESS_TOKEN_TTL_S, и это принятый компромисс.
   */
  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { id: payload.sub, sessionId: payload.sid };
  }
}
