import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PagePermissionsModule } from '../page-permissions/page-permissions.module';
import { AssetGcScheduler } from './asset-gc.scheduler';
import { AssetGcUseCases } from './asset-gc.use-cases';
import { AssetUploadUseCases } from './asset-upload.use-cases';
import { AssetsController, PageAssetsController, UserAvatarController } from './assets.controller';
import { AssetsUseCases } from './assets.use-cases';
import { OBJECT_STORAGE } from './storage/object-storage';
import { S3ObjectStorage } from './storage/s3-object-storage';

@Module({
  controllers: [AssetsController, PageAssetsController, UserAvatarController],
  exports: [AssetsUseCases, OBJECT_STORAGE],
  imports: [DatabaseModule, PagePermissionsModule],
  providers: [
    AssetsUseCases,
    AssetUploadUseCases,
    AssetGcUseCases,
    AssetGcScheduler,
    S3ObjectStorage,
    { provide: OBJECT_STORAGE, useExisting: S3ObjectStorage },
  ],
})
export class AssetsModule {}
