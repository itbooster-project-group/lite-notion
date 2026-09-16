import {
  All,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { TokenService } from '../auth/crypto/token.service';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { toHttpException } from '../pages/helpers';
import { PageDocumentService } from '../pages/page-document/page-document.service';
import {
  INTERNAL_AUTHENTICATE_PATH,
  INTERNAL_IDENTITY_SESSION_HEADER,
  INTERNAL_IDENTITY_USER_HEADER,
  INTERNAL_PAGE_ACCESS_PATH,
  INTERNAL_PAGE_DOCUMENT_PATH,
} from './constants';
import { InternalAuthenticationDto } from './dto/internal-authentication.dto';
import { InternalDocumentDto, ReplaceInternalDocumentDto } from './dto/internal-page-document.dto';
import { PageAccessDto } from './dto/page-access.dto';
import { InternalServiceGuard } from './guards/internal-service.guard';
import { InternalUserTokenGuard } from './guards/internal-user-token.guard';

function extractBearerToken(authorization: string | undefined): string {
  const [scheme, credentials] = authorization?.split(' ') ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || !credentials) {
    throw new UnauthorizedException('Unauthorized');
  }

  return credentials;
}

/**
 * Обращения между сервисами. Один контроллер на все операции: транспорт общий и
 * сменится целиком при переезде на gRPC. `@Public()` снимает глобальный
 * `JwtAuthGuard` — у каждого маршрута своя аутентификация.
 */
@ApiExcludeController()
@Controller()
export class InternalController {
  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
    @Inject(PageDocumentService) private readonly documents: PageDocumentService,
  ) {}

  /** Заголовки личности переносит шлюз, тело читает collaboration runtime. */
  @Public()
  @All([INTERNAL_AUTHENTICATE_PATH, `${INTERNAL_AUTHENTICATE_PATH}/*rest`])
  async authenticate(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<InternalAuthenticationDto> {
    const token = extractBearerToken(authorization);

    try {
      const verified = await this.tokens.verifyAccessToken(token);

      response.setHeader(INTERNAL_IDENTITY_USER_HEADER, verified.userId);
      response.setHeader(INTERNAL_IDENTITY_SESSION_HEADER, verified.sessionId);

      return InternalAuthenticationDto.fromVerified(verified);
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  @Public()
  @UseGuards(InternalUserTokenGuard)
  @Get(INTERNAL_PAGE_ACCESS_PATH)
  async authorizePage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<PageAccessDto> {
    return PageAccessDto.fromVerdict(
      await toHttpException(() => this.permissions.requireAccess(user.id, pageId)),
    );
  }

  @Public()
  @UseGuards(InternalServiceGuard)
  @Get(INTERNAL_PAGE_DOCUMENT_PATH)
  async readDocument(@Param('pageId', ParseUUIDPipe) pageId: string): Promise<InternalDocumentDto> {
    return InternalDocumentDto.fromRecord(
      await toHttpException(() => this.documents.readUnchecked(pageId)),
    );
  }

  @Public()
  @UseGuards(InternalServiceGuard)
  @Put(INTERNAL_PAGE_DOCUMENT_PATH)
  async replaceDocument(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: ReplaceInternalDocumentDto,
  ): Promise<InternalDocumentDto> {
    const yjsState = new Uint8Array(Buffer.from(body.yjsState, 'base64'));

    return InternalDocumentDto.fromRecord(
      await toHttpException(() => this.documents.replaceYjsStateUnchecked(pageId, yjsState)),
    );
  }
}
