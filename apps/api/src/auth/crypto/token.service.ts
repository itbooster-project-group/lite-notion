import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { type ApplicationConfig, applicationConfig } from '../../config/application-config';
import { REFRESH_TOKEN_BYTES } from '../constants';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, { expiresIn: this.config.accessTokenTtlS });
  }

  /**
   * Refresh-токен намеренно opaque: он не несёт полезной нагрузки и проверяется
   * только через строку в базе. Подписанный refresh соблазнял бы валидировать его
   * без обращения к базе, что сломало бы отзыв.
   */
  generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  /**
   * SHA-256 достаточно: токен — это 256 бит из CSPRNG, перебор невозможен,
   * а bcrypt здесь только замедлил бы горячий путь обновления.
   */
  hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }
}
