import { Module } from '@nestjs/common';
import { DocumentCaptureClient } from './document-capture.client';

@Module({
  exports: [DocumentCaptureClient],
  providers: [DocumentCaptureClient],
})
export class DocumentCaptureModule {}
