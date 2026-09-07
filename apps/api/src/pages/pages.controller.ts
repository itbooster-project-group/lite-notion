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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CascadeQueryDto } from '../common/dto/cascade-query.dto';
import { PurgeConfirmationResponseDto } from '../common/dto/purge-confirmation-response.dto';
import { HttpErrorResponseDto } from '../http-error-response.dto';
// Не `import type`: emitDecoratorMetadata кладёт в design:paramtypes рантайм-ссылку
// на класс, и без неё ValidationPipe молча перестаёт валидировать тело запроса.
import { CreatePageDto } from './dto/create-page.dto';
import { DeletedPageTreeNodeDto } from './dto/deleted-page.dto';
import { MovePageDto } from './dto/move-page.dto';
import { PageDto, PageTreeNodeDto } from './dto/page.dto';
import { RenamePageDto } from './dto/rename-page.dto';
import { RestorePageDto } from './dto/restore-page.dto';
import { toHttpException } from './helpers';
import { PagesService } from './pages.service';
import { CreatePageUseCase } from './use-cases/create-page.use-case';
import { MovePageUseCase } from './use-cases/move-page.use-case';
import { PurgePageUseCase } from './use-cases/purge-page.use-case';
import { PurgePagesTrashUseCase } from './use-cases/purge-pages-trash.use-case';
import { RestorePageUseCase } from './use-cases/restore-page.use-case';
import { SoftDeletePageUseCase } from './use-cases/soft-delete-page.use-case';

@ApiTags('pages')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponseDto,
})
@ApiBadRequestResponse({ description: 'Validation failed', type: HttpErrorResponseDto })
@ApiNotFoundResponse({
  description: 'Page or project does not exist, or belongs to another user',
  type: HttpErrorResponseDto,
})
@Controller('pages')
export class PagesController {
  constructor(
    @Inject(PagesService) private readonly pages: PagesService,
    @Inject(CreatePageUseCase) private readonly createPage: CreatePageUseCase,
    @Inject(MovePageUseCase) private readonly movePage: MovePageUseCase,
    @Inject(SoftDeletePageUseCase) private readonly softDeletePage: SoftDeletePageUseCase,
    @Inject(RestorePageUseCase) private readonly restorePage: RestorePageUseCase,
    @Inject(PurgePageUseCase) private readonly purgePage: PurgePageUseCase,
    @Inject(PurgePagesTrashUseCase) private readonly purgePagesTrash: PurgePagesTrashUseCase,
  ) {}

  @Post()
  @ApiBody({ type: CreatePageDto })
  @ApiOperation({ operationId: 'createPage', summary: 'Create a root or child page' })
  @ApiCreatedResponse({ description: 'Page created', type: PageDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePageDto,
  ): Promise<PageDto> {
    const page = await toHttpException(() =>
      this.createPage.execute({
        ownerId: user.id,
        parentPageId: body.parentPageId ?? null,
        projectId: body.projectId,
        title: body.title ?? '',
      }),
    );

    return PageDto.fromRecord(page);
  }

  @Get()
  @ApiOperation({ operationId: 'getPageTree', summary: 'Get the page tree of the current user' })
  @ApiOkResponse({ description: 'Page tree of the current user', type: [PageTreeNodeDto] })
  async findTree(@CurrentUser() user: AuthenticatedUser): Promise<PageTreeNodeDto[]> {
    const tree = await this.pages.findTree(user.id);

    return tree.map(PageTreeNodeDto.fromNode);
  }

  @Get('trash')
  @ApiOperation({ operationId: 'getPageTrash', summary: 'Get the page trash of the current user' })
  @ApiOkResponse({ description: 'Deleted pages as a tree', type: [DeletedPageTreeNodeDto] })
  async findDeletedTree(@CurrentUser() user: AuthenticatedUser): Promise<DeletedPageTreeNodeDto[]> {
    const trash = await this.pages.findDeletedTree(user.id);

    return trash.map(DeletedPageTreeNodeDto.fromNode);
  }

  @Get(':pageId')
  @ApiParam({ format: 'uuid', name: 'pageId', type: String })
  @ApiOperation({ operationId: 'getPage', summary: 'Get a single page' })
  @ApiOkResponse({ description: 'Requested page', type: PageDto })
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<PageDto> {
    return PageDto.fromRecord(await toHttpException(() => this.pages.findById(pageId, user.id)));
  }

  @Patch(':pageId')
  @ApiParam({ format: 'uuid', name: 'pageId', type: String })
  @ApiBody({ type: RenamePageDto })
  @ApiOperation({ operationId: 'renamePage', summary: 'Rename a page' })
  @ApiOkResponse({ description: 'Page renamed', type: PageDto })
  async rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: RenamePageDto,
  ): Promise<PageDto> {
    const page = await toHttpException(() => this.pages.rename(pageId, user.id, body.title));

    return PageDto.fromRecord(page);
  }

  @Post(':pageId/move')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'pageId', type: String })
  @ApiBody({ type: MovePageDto })
  @ApiOperation({ operationId: 'movePage', summary: 'Move a page subtree and reorder siblings' })
  @ApiOkResponse({ description: 'Page moved', type: PageDto })
  @ApiConflictResponse({
    description: 'The move would create a cycle in the tree',
    type: HttpErrorResponseDto,
  })
  async move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: MovePageDto,
  ): Promise<PageDto> {
    const page = await toHttpException(() =>
      this.movePage.execute({
        nextSiblingId: body.nextSiblingId ?? null,
        ownerId: user.id,
        pageId,
        parentPageId: body.parentPageId ?? null,
        previousSiblingId: body.previousSiblingId ?? null,
      }),
    );

    return PageDto.fromRecord(page);
  }

  @Delete('trash')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'purgePageTrash',
    summary: 'Permanently delete every page in the trash',
  })
  @ApiNoContentResponse({ description: 'Page trash emptied' })
  async purgeTrash(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.purgePagesTrash.execute(user.id);
  }

  @Delete('trash/:pageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ format: 'uuid', name: 'pageId', type: String })
  @ApiQuery({
    description:
      'Confirms destroying trash entries that the trash listing showed outside the target. Without it such a request is refused with 409 listing their titles.',
    name: 'cascade',
    required: false,
    type: Boolean,
  })
  @ApiOperation({
    operationId: 'purgePage',
    summary: 'Permanently delete a page from the trash',
  })
  @ApiNoContentResponse({ description: 'Page permanently deleted' })
  @ApiConflictResponse({
    description: 'Trash entries outside the target would be destroyed; confirm with cascade=true',
    type: PurgeConfirmationResponseDto,
  })
  async purge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Query() query: CascadeQueryDto,
  ): Promise<void> {
    await toHttpException(() => this.purgePage.execute(pageId, user.id, query.cascade ?? false));
  }

  @Delete(':pageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ format: 'uuid', name: 'pageId', type: String })
  @ApiOperation({ operationId: 'deletePage', summary: 'Move a page and its subtree to the trash' })
  @ApiNoContentResponse({ description: 'Page moved to the trash' })
  async softDelete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<void> {
    await toHttpException(() => this.softDeletePage.execute(pageId, user.id));
  }

  @Post(':pageId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'pageId', type: String })
  @ApiBody({ required: false, type: RestorePageDto })
  @ApiOperation({ operationId: 'restorePage', summary: 'Restore a page from the trash' })
  @ApiOkResponse({ description: 'Page restored', type: PageDto })
  @ApiConflictResponse({
    description:
      'The page was deleted along with its parent or project, so it cannot be restored on its own',
    type: HttpErrorResponseDto,
  })
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: RestorePageDto,
  ): Promise<PageDto> {
    const page = await toHttpException(() =>
      this.restorePage.execute({
        ownerId: user.id,
        pageId,
        targetProjectId: body.projectId ?? null,
      }),
    );

    return PageDto.fromRecord(page);
  }
}
