import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { type ApplicationConfig, applicationConfig } from '../config/application-config';
import { HttpErrorResponseDto } from '../http-error-response.dto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE_NAME } from './constants';
import { AuthResponseDto, TokenResponseDto, UserProfileDto } from './dto/auth-response.dto';
// Не `import type`: emitDecoratorMetadata кладёт в design:paramtypes рантайм-ссылку
// на класс, и без неё ValidationPipe молча перестаёт валидировать тело запроса.
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { createClearRefreshCookieOptions, createRefreshCookieOptions } from './helpers';
import { type IssuedSession, type SessionOrigin, SessionService } from './session/session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  @Post('register')
  @Public()
  @ApiBody({ type: RegisterDto })
  @ApiOperation({ operationId: 'register', summary: 'Create an account and open a session' })
  @ApiCreatedResponse({ description: 'Account created', type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered', type: HttpErrorResponseDto })
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const { session, user } = await this.authService.register(body, this.readOrigin(request));

    this.setRefreshCookie(response, session);

    return { ...this.toTokenResponse(session), user: UserProfileDto.fromUser(user) };
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LoginDto })
  @ApiOperation({ operationId: 'login', summary: 'Sign in with email and password' })
  @ApiOkResponse({ description: 'Signed in', type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials', type: HttpErrorResponseDto })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const { session, user } = await this.authService.login(body, this.readOrigin(request));

    this.setRefreshCookie(response, session);

    return { ...this.toTokenResponse(session), user: UserProfileDto.fromUser(user) };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'refreshTokens', summary: 'Rotate the refresh token' })
  @ApiOkResponse({ description: 'New token pair issued', type: TokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token', type: HttpErrorResponseDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponseDto> {
    const refreshToken = this.readRefreshCookie(request);

    if (refreshToken === undefined) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let session: IssuedSession;

    try {
      session = await this.sessions.rotate(refreshToken, this.readOrigin(request));
    } catch (error) {
      // Чистим cookie, чтобы браузер перестал долбиться мёртвым токеном
      // и клиент сразу ушёл на форму входа.
      this.clearRefreshCookie(response);

      throw error;
    }

    this.setRefreshCookie(response, session);

    return this.toTokenResponse(session);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'logout', summary: 'End the current session chain' })
  @ApiNoContentResponse({ description: 'Session ended' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized', type: HttpErrorResponseDto })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.logout(user.sessionId);

    this.clearRefreshCookie(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'logoutEverywhere', summary: 'End every session of the account' })
  @ApiNoContentResponse({ description: 'All sessions ended' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized', type: HttpErrorResponseDto })
  async logoutEverywhere(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.logoutEverywhere(user.id);

    this.clearRefreshCookie(response);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'getCurrentUser', summary: 'Read the current account profile' })
  @ApiOkResponse({ description: 'Current account', type: UserProfileDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized', type: HttpErrorResponseDto })
  async getCurrentUser(@CurrentUser() currentUser: AuthenticatedUser): Promise<UserProfileDto> {
    const user = await this.users.findById(currentUser.id);

    if (user === null) {
      throw new UnauthorizedException('Unauthorized');
    }

    return UserProfileDto.fromUser(user);
  }

  private readOrigin(request: Request): SessionOrigin {
    return { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const refreshToken: unknown = request.cookies?.[REFRESH_COOKIE_NAME];

    return typeof refreshToken === 'string' && refreshToken.length > 0 ? refreshToken : undefined;
  }

  private setRefreshCookie(response: Response, session: IssuedSession): void {
    response.cookie(
      REFRESH_COOKIE_NAME,
      session.refreshToken,
      createRefreshCookieOptions(this.config.nodeEnvironment, this.config.refreshTokenTtlS),
    );
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(
      REFRESH_COOKIE_NAME,
      createClearRefreshCookieOptions(this.config.nodeEnvironment),
    );
  }

  private toTokenResponse(session: IssuedSession): TokenResponseDto {
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  }
}
