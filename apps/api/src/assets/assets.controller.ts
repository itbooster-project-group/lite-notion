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
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AssetGcUseCases } from './asset-gc.use-cases';
import { AssetUploadUseCases } from './asset-upload.use-cases';
import { AssetsUseCases } from './assets.use-cases';
import {
  AssetReadUrlDto,
  AssetResponseDto,
  AssetUploadInitiatedDto,
} from './dto/asset-response.dto';
import { InitiateAssetUploadDto } from './dto/initiate-asset-upload.dto';
import { SetAssetReferenceDto } from './dto/set-asset-reference.dto';

@ApiBearerAuth()
@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(
    @Inject(AssetsUseCases) private readonly assets: AssetsUseCases,
    @Inject(AssetUploadUseCases) private readonly uploads: AssetUploadUseCases,
    @Inject(AssetGcUseCases) private readonly assetGc: AssetGcUseCases,
  ) {}

  @Post('uploads')
  @ApiBody({ type: InitiateAssetUploadDto })
  @ApiOperation({ operationId: 'initiateAssetUpload', summary: 'Start an image upload' })
  @ApiCreatedResponse({ type: AssetUploadInitiatedDto })
  initiate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InitiateAssetUploadDto,
  ): Promise<AssetUploadInitiatedDto> {
    return this.uploads.initiate(user.id, body.pageId, body.fileName);
  }

  @Put(':assetId/content')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'assetId', type: String })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiOperation({
    operationId: 'uploadAssetContent',
    summary: 'Stream image bytes to private storage',
  })
  @ApiOkResponse({ type: AssetResponseDto })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Req() request: Request,
  ): Promise<AssetResponseDto> {
    return this.uploads.upload(user.id, assetId, request);
  }

  @Get(':assetId')
  @ApiParam({ format: 'uuid', name: 'assetId', type: String })
  @ApiQuery({ format: 'uuid', name: 'pageId', required: true, type: String })
  @ApiOperation({
    operationId: 'getAssetMetadata',
    summary: 'Read asset metadata in an authorized context',
  })
  @ApiOkResponse({ type: AssetResponseDto })
  metadata(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Query('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<AssetResponseDto> {
    return this.assets.metadataForPage(user.id, assetId, pageId);
  }

  @Post(':assetId/read-url')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'assetId', type: String })
  @ApiQuery({ format: 'uuid', name: 'pageId', required: true, type: String })
  @ApiOperation({
    operationId: 'createAssetReadUrl',
    summary: 'Create a short-lived private read URL',
  })
  @ApiOkResponse({ type: AssetReadUrlDto })
  readUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Query('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<AssetReadUrlDto> {
    return this.assets.readUrlForPage(user.id, assetId, pageId);
  }

  @Delete(':assetId')
  @ApiParam({ format: 'uuid', name: 'assetId', type: String })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'deleteAsset', summary: 'Delete an unused asset' })
  @ApiNoContentResponse()
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<void> {
    await this.assetGc.delete(user.id, assetId);
  }
}

@ApiBearerAuth()
@ApiTags('assets')
@ApiParam({ format: 'uuid', name: 'pageId', type: String })
@Controller('pages/:pageId/assets')
export class PageAssetsController {
  constructor(@Inject(AssetsUseCases) private readonly assets: AssetsUseCases) {}

  @Post(':assetId/grant')
  @ApiParam({ format: 'uuid', name: 'assetId', type: String })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'grantAssetToPage',
    summary: 'Allow an uploaded asset on another page',
  })
  @ApiNoContentResponse()
  async grant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<void> {
    await this.assets.grant(user.id, pageId, assetId);
  }

  @Put('cover')
  @ApiBody({ type: SetAssetReferenceDto })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'setPageCover', summary: 'Set or remove a page cover image' })
  @ApiNoContentResponse()
  async setCover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: SetAssetReferenceDto,
  ): Promise<void> {
    await this.assets.setCover(user.id, pageId, body.assetId ?? null);
  }
}

@ApiBearerAuth()
@ApiTags('assets')
@Controller('users')
export class UserAvatarController {
  constructor(@Inject(AssetsUseCases) private readonly assets: AssetsUseCases) {}

  @Put('me/avatar')
  @ApiBody({ type: SetAssetReferenceDto })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'setCurrentUserAvatar',
    summary: 'Set or remove the current user avatar',
  })
  @ApiNoContentResponse()
  async setAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SetAssetReferenceDto,
  ): Promise<void> {
    await this.assets.setAvatar(user.id, body.assetId ?? null);
  }

  @Get(':userId/avatar/:assetId/read-url')
  @ApiParam({ format: 'uuid', name: 'userId', type: String })
  @ApiParam({ format: 'uuid', name: 'assetId', type: String })
  @ApiOperation({
    operationId: 'createAvatarReadUrl',
    summary: 'Create a read URL for a current avatar',
  })
  @ApiOkResponse({ type: AssetReadUrlDto })
  readAvatarUrl(
    @CurrentUser() _user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<AssetReadUrlDto> {
    return this.assets.readUrlForAvatar(assetId, userId);
  }
}
