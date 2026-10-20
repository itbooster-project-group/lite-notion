import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { HttpErrorResponseDto } from '../http-error-response.dto';
import { PublicationManagementDto } from './dto/publication-management.dto';
import { PublishPageDto } from './dto/publish-page.dto';
import { RepublishPageDto } from './dto/republish-page.dto';
import { UpdatePublicationMetadataDto } from './dto/update-publication-metadata.dto';
import { toPublicationHttpException } from './helpers';
import { PublicationManagementService } from './publication-management.service';
import { PublishPageUseCase } from './use-cases/publish-page.use-case';
import { RepublishPageUseCase } from './use-cases/republish-page.use-case';
import { UnpublishPageUseCase } from './use-cases/unpublish-page.use-case';
import { UpdatePublicationMetadataUseCase } from './use-cases/update-publication-metadata.use-case';

@ApiTags('publications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponseDto,
})
@ApiBadRequestResponse({ description: 'Validation failed', type: HttpErrorResponseDto })
@ApiForbiddenResponse({
  description: 'The page is visible but requires editor permission',
  type: HttpErrorResponseDto,
})
@ApiNotFoundResponse({
  description: 'Page or publication was not found',
  type: HttpErrorResponseDto,
})
@ApiConflictResponse({
  description: 'Publication state or slug conflicts with current state',
  type: HttpErrorResponseDto,
})
@ApiParam({ format: 'uuid', name: 'pageId', type: String })
@Controller('pages/:pageId/publication')
export class PublicationsController {
  constructor(
    @Inject(PublicationManagementService) private readonly management: PublicationManagementService,
    @Inject(PublishPageUseCase) private readonly publishPage: PublishPageUseCase,
    @Inject(RepublishPageUseCase) private readonly republishPage: RepublishPageUseCase,
    @Inject(UnpublishPageUseCase) private readonly unpublishPage: UnpublishPageUseCase,
    @Inject(UpdatePublicationMetadataUseCase)
    private readonly updateMetadata: UpdatePublicationMetadataUseCase,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'getPagePublication', summary: 'Get publication state for a page' })
  @ApiOkResponse({ type: PublicationManagementDto })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<PublicationManagementDto> {
    try {
      return PublicationManagementDto.fromView(await this.management.get(user.id, pageId));
    } catch (error) {
      toPublicationHttpException(error);
    }
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: PublishPageDto })
  @ApiOperation({ operationId: 'publishPage', summary: 'Publish the current page document' })
  @ApiOkResponse({ type: PublicationManagementDto })
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: PublishPageDto,
  ): Promise<PublicationManagementDto> {
    try {
      const result = await this.publishPage.execute({ actorId: user.id, pageId, slug: body.slug });
      return PublicationManagementDto.fromRecord(result.publication);
    } catch (error) {
      toPublicationHttpException(error);
    }
  }

  @Post('republish')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RepublishPageDto })
  @ApiOperation({ operationId: 'republishPage', summary: 'Create a new published snapshot' })
  @ApiOkResponse({ type: PublicationManagementDto })
  async republish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: RepublishPageDto,
  ): Promise<PublicationManagementDto> {
    try {
      const result = await this.republishPage.execute({
        actorId: user.id,
        pageId,
        ...(body.slug === undefined ? {} : { slug: body.slug }),
      });
      return PublicationManagementDto.fromRecord(result.publication);
    } catch (error) {
      toPublicationHttpException(error);
    }
  }

  @Post('unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'unpublishPage', summary: 'Make a published page unavailable' })
  @ApiOkResponse({ type: PublicationManagementDto })
  async unpublish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<PublicationManagementDto> {
    try {
      return PublicationManagementDto.fromRecord(await this.unpublishPage.execute(user.id, pageId));
    } catch (error) {
      toPublicationHttpException(error);
    }
  }

  @Patch()
  @ApiBody({ type: UpdatePublicationMetadataDto })
  @ApiOperation({
    operationId: 'updatePagePublicationMetadata',
    summary: 'Update publication slug and SEO metadata',
  })
  @ApiOkResponse({ type: PublicationManagementDto })
  async patchMetadata(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: UpdatePublicationMetadataDto,
  ): Promise<PublicationManagementDto> {
    try {
      const metadata = {
        ...(body.slug === undefined ? {} : { slug: body.slug }),
        ...(body.seoTitle === undefined ? {} : { seoTitle: body.seoTitle }),
        ...(body.seoDescription === undefined ? {} : { seoDescription: body.seoDescription }),
      };
      return PublicationManagementDto.fromRecord(
        await this.updateMetadata.execute({ actorId: user.id, pageId, metadata }),
      );
    } catch (error) {
      toPublicationHttpException(error);
    }
  }
}
