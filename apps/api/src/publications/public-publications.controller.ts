import { Controller, Get, Header, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import {
  ApiFoundResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PublicPublicationDto } from './dto/public-publication.dto';
import { PublicationsReadService } from './publications-read.service';

@ApiTags('public-publications')
@Controller('public/publications')
export class PublicPublicationsController {
  constructor(
    @Inject(PublicationsReadService) private readonly publications: PublicationsReadService,
  ) {}

  @Get(':slug')
  @Public()
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'slug', type: String })
  @ApiOperation({ operationId: 'getPublicPublication', summary: 'Read a published page by slug' })
  @ApiOkResponse({ type: PublicPublicationDto })
  @ApiNotFoundResponse({ description: 'Publication is unavailable' })
  async get(@Param('slug') slug: string): Promise<PublicPublicationDto> {
    const publication = await this.publications.getPublic(slug);
    if (!publication) throw new NotFoundException('Publication not found');
    return PublicPublicationDto.fromView(publication);
  }

  @Get(':slug/assets/:assetId')
  @Public()
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiParam({ name: 'slug', type: String })
  @ApiParam({ format: 'uuid', name: 'assetId', type: String })
  @ApiOperation({
    operationId: 'resolvePublicPublicationAsset',
    summary: 'Redirect to a short-lived public asset URL',
  })
  @ApiFoundResponse({
    description: 'Redirect to a short-lived signed asset URL',
    headers: {
      'Cache-Control': { schema: { type: 'string' } },
      Location: { schema: { format: 'uri', type: 'string' } },
      'Referrer-Policy': { schema: { type: 'string' } },
    },
  })
  @ApiNotFoundResponse({ description: 'Asset is not part of the current public publication' })
  async resolveAsset(
    @Param('slug') slug: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
  ): Promise<void> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)
    ) {
      throw new NotFoundException('Publication asset not found');
    }
    const signedUrl = await this.publications.resolveAsset(slug, assetId);
    if (!signedUrl) throw new NotFoundException('Publication asset not found');
    response
      .status(302)
      .set({
        'Cache-Control': 'private, no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
        Location: signedUrl,
      })
      .send();
  }
}
