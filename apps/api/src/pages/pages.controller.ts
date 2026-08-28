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
  ApiCreatedResponse,
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
import { CreatePageDto } from './dto/create-page.dto';
import { MovePageDto } from './dto/move-page.dto';
import { PageDto, PageTreeNodeDto } from './dto/page.dto';
import { RenamePageDto } from './dto/rename-page.dto';
import { toHttpException } from './helpers';
import { PagesService } from './pages.service';

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
  constructor(@Inject(PagesService) private readonly pages: PagesService) {}

  @Post()
  @ApiBody({ type: CreatePageDto })
  @ApiOperation({ operationId: 'createPage', summary: 'Create a root or child page' })
  @ApiCreatedResponse({ description: 'Page created', type: PageDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePageDto,
  ): Promise<PageDto> {
    const page = await toHttpException(() =>
      this.pages.create({
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
      this.pages.move({
        nextSiblingId: body.nextSiblingId ?? null,
        ownerId: user.id,
        pageId,
        parentPageId: body.parentPageId ?? null,
        previousSiblingId: body.previousSiblingId ?? null,
      }),
    );

    return PageDto.fromRecord(page);
  }
}
