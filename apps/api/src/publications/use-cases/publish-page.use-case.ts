import { Inject, Injectable } from '@nestjs/common';
import { PublicationPipeline, type PublishPageCommand } from '../publication-pipeline';

@Injectable()
export class PublishPageUseCase {
  constructor(@Inject(PublicationPipeline) private readonly pipeline: PublicationPipeline) {}

  execute(command: PublishPageCommand) {
    return this.pipeline.publishFirst(command);
  }
}
