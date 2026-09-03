import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { HttpErrorResponseDto } from '../../http-error-response.dto';
import { toHttpException } from '../helpers';
// Не `import type`: emitDecoratorMetadata кладёт в design:paramtypes рантайм-ссылку
// на класс, и без неё ValidationPipe молча перестаёт валидировать тело запроса.
import { PageDocumentDto, UpdatePageDocumentDto } from './dto/page-document.dto';
import { PageDocumentService } from './page-document.service';

/**
 * Создания и удаления документа здесь нет намеренно: строка появляется вместе со
 * страницей и уходит каскадом вместе с ней.
 */
@ApiTags('pages')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponseDto,
})
@ApiBadRequestResponse({ description: 'Validation failed', type: HttpErrorResponseDto })
@ApiNotFoundResponse({
  description: 'Page does not exist or belongs to another user',
  type: HttpErrorResponseDto,
})
@Controller('pages/:pageId/document')
export class PageDocumentController {
  constructor(@Inject(PageDocumentService) private readonly documents: PageDocumentService) {}

  @Get()
  @ApiParam({ format: 'uuid', name: 'pageId', type: String })
  @ApiOperation({ operationId: 'getPageDocument', summary: 'Read the content of a page' })
  @ApiOkResponse({ description: 'Document content', type: PageDocumentDto })
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<PageDocumentDto> {
    const document = await toHttpException(() => this.documents.read(pageId, user.id));

    return PageDocumentDto.fromRecord(document);
  }

  @Put()
  @ApiParam({ format: 'uuid', name: 'pageId', type: String })
  @ApiBody({ type: UpdatePageDocumentDto })
  @ApiOperation({
    operationId: 'updatePageDocument',
    summary: 'Replace the content of a page',
  })
  @ApiOkResponse({ description: 'Document replaced', type: PageDocumentDto })
  async replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: UpdatePageDocumentDto,
  ): Promise<PageDocumentDto> {
    const document = await toHttpException(() =>
      this.documents.replace({
        ownerId: user.id,
        pageId,
        tiptapSchemaVersion: body.tiptapSchemaVersion,
        yjsState: new Uint8Array(Buffer.from(body.yjsState, 'base64')),
      }),
    );

    return PageDocumentDto.fromRecord(document);
  }
}
