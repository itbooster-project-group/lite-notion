import { createHash, randomBytes } from 'node:crypto';
import type { AccessTokenPayload } from '@lite-notion/auth-token';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { type ApplicationConfig, applicationConfig } from '../../config/application-config';
import { REFRESH_TOKEN_BYTES } from '../constants';
import { AccessTokenVerificationError } from '../errors';

export interface VerifiedAccessToken {
  expiresAt: Date;
  sessionId: string;
  userId: string;
}

interface VerifiedPayload extends AccessTokenPayload {
  exp: number;
}

function isVerifiedPayload(value: unknown): value is VerifiedPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<VerifiedPayload>;

  return (
    typeof payload.sub === 'string' &&
    typeof payload.sid === 'string' &&
    typeof payload.exp === 'number'
  );
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
   * Единственная проверка access-токена в системе. Алгоритм задан явно, иначе
   * подпись приняли бы любым HMAC-вариантом. `exp` нужен вызывающему наружу.
   */
  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    const payload = await this.jwtService.verifyAsync<Record<string, unknown>>(token, {
      algorithms: ['HS256'],
      secret: this.config.jwtSecret,
    });

    if (!isVerifiedPayload(payload)) {
      throw new AccessTokenVerificationError();
    }

    return {
      expiresAt: new Date(payload.exp * 1000),
      sessionId: payload.sid,
      userId: payload.sub,
    };
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
