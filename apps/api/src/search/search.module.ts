import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PagePermissionsModule } from '../page-permissions/page-permissions.module';
import { SearchController } from './search.controller';
import { SearchRepository } from './search.repository';
import { SearchReadService } from './search-read.service';

@Module({
  controllers: [SearchController],
  exports: [SearchReadService],
  imports: [DatabaseModule, PagePermissionsModule],
  providers: [SearchReadService, SearchRepository],
})
export class SearchModule {}
