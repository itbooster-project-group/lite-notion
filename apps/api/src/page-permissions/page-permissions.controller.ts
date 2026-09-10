import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { HttpErrorResponseDto } from '../http-error-response.dto';
// Не `import type`: emitDecoratorMetadata кладёт в design:paramtypes рантайм-ссылку
// на класс, и без неё ValidationPipe молча перестаёт валидировать тело запроса.
import { GrantPagePermissionDto } from './dto/grant-page-permission.dto';
import { PagePermissionDto } from './dto/page-permission.dto';
import { toHttpException } from './helpers';
import { PagePermissionsService } from './page-permissions.service';

@ApiTags('page-permissions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponseDto,
})
@ApiBadRequestResponse({ description: 'Validation failed', type: HttpErrorResponseDto })
@ApiForbiddenResponse({
  description: 'The page is visible to the current user, but managing access needs ownership',
  type: HttpErrorResponseDto,
})
@ApiNotFoundResponse({
  description: 'Page or permission does not exist, or the page is not accessible',
  type: HttpErrorResponseDto,
})
@ApiParam({ format: 'uuid', name: 'pageId', type: String })
@Controller('pages/:pageId/permissions')
export class PagePermissionsController {
  constructor(
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'getPagePermissions',
    summary: 'List direct permissions of a page',
  })
  @ApiOkResponse({ description: 'Direct permissions of the page', type: [PagePermissionDto] })
  async findByPage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<PagePermissionDto[]> {
    const permissions = await toHttpException(() => this.permissions.findByPage(user.id, pageId));

    return permissions.map(PagePermissionDto.fromRecord);
  }

  @Put()
  @ApiBody({ type: GrantPagePermissionDto })
  @ApiOperation({
    operationId: 'grantPagePermission',
    summary: 'Grant or change a direct permission on a page',
  })
  @ApiOkResponse({ description: 'Permission granted or changed', type: PagePermissionDto })
  async grant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: GrantPagePermissionDto,
  ): Promise<PagePermissionDto> {
    const permission = await toHttpException(() =>
      this.permissions.grant(user.id, pageId, body.email, body.role),
    );

    return PagePermissionDto.fromRecord(permission);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ format: 'uuid', name: 'userId', type: String })
  @ApiOperation({
    operationId: 'revokePagePermission',
    summary: 'Revoke a direct permission on a page',
  })
  @ApiNoContentResponse({ description: 'Permission revoked' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await toHttpException(() => this.permissions.revoke(user.id, pageId, userId));
  }
}
