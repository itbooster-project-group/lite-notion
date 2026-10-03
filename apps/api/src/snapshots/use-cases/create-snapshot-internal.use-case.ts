import { Inject, Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../database/transaction';
import type { CreateInternalSnapshotInput } from '../types/snapshot-creation';
import type { SnapshotMetadata } from '../types/snapshot-metadata';
import { SnapshotCreationWorkflow } from './snapshot-creation.workflow';

@Injectable()
export class CreateSnapshotInternalUseCase {
  constructor(
    @Inject(SnapshotCreationWorkflow) private readonly creation: SnapshotCreationWorkflow,
  ) {}

  execute(
    input: CreateInternalSnapshotInput,
    externalScope?: TransactionScope,
  ): Promise<SnapshotMetadata> {
    const capturedInput = { ...input, yjsState: input.yjsState.slice() };

    return this.creation.create(capturedInput, input.reason, externalScope);
  }
}
