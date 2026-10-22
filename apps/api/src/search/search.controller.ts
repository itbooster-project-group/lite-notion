import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { HttpErrorResponseDto } from '../http-error-response.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResultDto } from './dto/search-result.dto';
import { SearchReadService } from './search-read.service';

@ApiBearerAuth()
@ApiTags('search')
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponseDto,
})
@ApiBadRequestResponse({ description: 'Validation failed', type: HttpErrorResponseDto })
@Controller('search')
export class SearchController {
  constructor(@Inject(SearchReadService) private readonly search: SearchReadService) {}

  @Get()
  @ApiQuery({ type: SearchQueryDto })
  @ApiOperation({
    operationId: 'searchPages',
    summary: 'Search accessible pages by title and content',
  })
  @ApiOkResponse({
    description: 'Permission-filtered page search results',
    type: [SearchResultDto],
  })
  searchPages(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultDto[]> {
    return this.search.searchPages(user.id, query.query, query.limit);
  }
}
