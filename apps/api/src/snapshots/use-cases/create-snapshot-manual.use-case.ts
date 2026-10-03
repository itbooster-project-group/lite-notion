import { Inject, Injectable } from '@nestjs/common';
import { type TransactionScope } from '../../database/transaction';
import { SnapshotReason } from '../../generated/prisma/enums';
import { PageRole } from '../../page-permissions/constants';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import type { CreateManualSnapshotInput } from '../types/snapshot-creation';
import type { SnapshotMetadata } from '../types/snapshot-metadata';
import { SnapshotCreationWorkflow } from './snapshot-creation.workflow';

@Injectable()
export class CreateSnapshotManualUseCase {
  constructor(
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(SnapshotCreationWorkflow) private readonly creation: SnapshotCreationWorkflow,
  ) {}

  execute(
    input: CreateManualSnapshotInput,
    externalScope?: TransactionScope,
  ): Promise<SnapshotMetadata> {
    const capturedInput = { ...input, yjsState: input.yjsState.slice() };

    return this.creation.create(
      capturedInput,
      SnapshotReason.manual,
      externalScope,
      async (scope) => {
        const role = await this.permissions
          .bind(scope)
          .resolveRole(capturedInput.createdById, capturedInput.pageId);
        assertRole(role, PageRole.EDITOR);
      },
    );
  }
}
