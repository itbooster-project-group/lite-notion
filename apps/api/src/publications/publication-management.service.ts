import { Inject, Injectable } from '@nestjs/common';
import { PageRole } from '../page-permissions/constants';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { PublicationsReadService } from './publications-read.service';

@Injectable()
export class PublicationManagementService {
  constructor(
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
    @Inject(PublicationsReadService) private readonly publications: PublicationsReadService,
  ) {}

  async get(actorId: string, pageId: string) {
    await this.permissions.requireRole(actorId, pageId, PageRole.EDITOR);
    return this.publications.getManagement(pageId);
  }
}
