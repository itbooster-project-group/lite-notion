import { Inject, Injectable } from '@nestjs/common';
import { PublicationPipeline, type RepublishPageCommand } from '../publication-pipeline';

@Injectable()
export class RepublishPageUseCase {
  constructor(@Inject(PublicationPipeline) private readonly pipeline: PublicationPipeline) {}

  execute(command: RepublishPageCommand) {
    return this.pipeline.republish(command);
  }
}
