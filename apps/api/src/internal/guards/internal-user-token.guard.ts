import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from '../../auth/crypto/token.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

interface RequestWithIdentity {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

/** Личность только из проброшенного токена клиента: режима «от чужого имени» нет. */
@Injectable()
export class InternalUserTokenGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    const authorization = request.headers.authorization;
    const [scheme, credentials] = (typeof authorization === 'string' ? authorization : '').split(
      ' ',
    );

    if (scheme?.toLowerCase() !== 'bearer' || !credentials) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      const verified = await this.tokens.verifyAccessToken(credentials);

      request.user = { id: verified.userId, sessionId: verified.sessionId };
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }
}
