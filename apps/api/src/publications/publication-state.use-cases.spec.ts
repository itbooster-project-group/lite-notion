import { describe, expect, it, vi } from 'vitest';
import { InMemoryTransactionRunner } from '../database/transaction.in-memory';
import { PageRole } from '../page-permissions/constants';
import { PagePermissionsRepository } from '../page-permissions/page-permissions.repository';
import { PagesRepository } from '../pages/pages.repository';
import { PublicationNotFoundError, PublicationStateConflictError } from './publication-errors';
import type { PublicationRecord, PublicationsRepository } from './publications.repository';
import { UnpublishPageUseCase } from './use-cases/unpublish-page.use-case';
import { UpdatePublicationMetadataUseCase } from './use-cases/update-publication-metadata.use-case';

const actorId = '11111111-1111-4111-8111-111111111111';
const pageId = '22222222-2222-4222-8222-222222222222';

function record(status: PublicationRecord['status']): PublicationRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    pageId,
    publishedAt: status === 'draft' ? null : new Date('2026-01-01T00:00:00.000Z'),
    seoDescription: null,
    seoTitle: null,
    slug: 'current-slug',
    snapshotId: status === 'draft' ? null : '44444444-4444-4444-8444-444444444444',
    status,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function harness(current: PublicationRecord | null) {
  let stored = current;
  const publications = {
    bind: () => publications,
    findByPage: vi.fn(async () => stored),
    createDraft: vi.fn(async (id: string, metadata: { slug: string }) => {
      stored = { ...record('draft'), pageId: id, slug: metadata.slug };
      return stored;
    }),
    updateMetadata: vi.fn(async (_id: string, metadata: Partial<PublicationRecord>) => {
      if (!stored) return null;
      stored = { ...stored, ...metadata, updatedAt: new Date() };
      return stored;
    }),
    unpublish: vi.fn(async () => {
      if (!stored) return null;
      stored = { ...stored, status: 'unpublished' as const };
      return stored;
    }),
    createRevalidation: vi.fn(async () => undefined),
  } as unknown as PublicationsRepository;
  const pages = {
    findLiveById: vi.fn(async () => ({ id: pageId, ownerId: actorId })),
    bind: () => pages,
  } as unknown as PagesRepository;
  const permissions = {
    resolveRole: vi.fn(async () => PageRole.OWNER),
    bind: () => permissions,
  } as unknown as PagePermissionsRepository;
  const transactions = new InMemoryTransactionRunner();
  return { pages, permissions, publications, stored: () => stored, transactions };
}

describe('publication state use cases', () => {
  it('requires a slug to create a draft, then keeps metadata updates snapshot-free', async () => {
    const h = harness(null);
    const useCase = new UpdatePublicationMetadataUseCase(
      h.transactions,
      h.pages,
      h.permissions,
      h.publications,
    );

    await expect(
      useCase.execute({ actorId, pageId, metadata: { seoTitle: 'Draft' } }),
    ).rejects.toThrow('slug is required for a draft');
    await expect(
      useCase.execute({ actorId, pageId, metadata: { seoTitle: 'Draft', slug: 'My-Draft' } }),
    ).resolves.toMatchObject({ slug: 'my-draft', status: 'draft', snapshotId: null });
    expect(h.publications.createDraft).toHaveBeenCalledTimes(1);
    expect(h.publications.createRevalidation).not.toHaveBeenCalled();
  });

  it('rejects draft to unpublished and treats repeated unpublish as an idempotent no-op', async () => {
    const draft = harness(record('draft'));
    const draftUnpublish = new UnpublishPageUseCase(
      draft.transactions,
      draft.pages,
      draft.permissions,
      draft.publications,
    );
    await expect(draftUnpublish.execute(actorId, pageId)).rejects.toBeInstanceOf(
      PublicationStateConflictError,
    );

    const unpublished = harness(record('unpublished'));
    const repeatedUnpublish = new UnpublishPageUseCase(
      unpublished.transactions,
      unpublished.pages,
      unpublished.permissions,
      unpublished.publications,
    );
    await expect(repeatedUnpublish.execute(actorId, pageId)).resolves.toMatchObject({
      status: 'unpublished',
    });
    expect(unpublished.publications.unpublish).not.toHaveBeenCalled();
    expect(unpublished.publications.createRevalidation).not.toHaveBeenCalled();
  });

  it('returns not found when unpublishing without a publication row', async () => {
    const h = harness(null);
    const useCase = new UnpublishPageUseCase(
      h.transactions,
      h.pages,
      h.permissions,
      h.publications,
    );
    await expect(useCase.execute(actorId, pageId)).rejects.toBeInstanceOf(PublicationNotFoundError);
  });

  it('changes a published slug and SEO without replacing its snapshot, invalidating both routes', async () => {
    const h = harness(record('published'));
    const useCase = new UpdatePublicationMetadataUseCase(
      h.transactions,
      h.pages,
      h.permissions,
      h.publications,
    );

    const updated = await useCase.execute({
      actorId,
      pageId,
      metadata: { seoTitle: 'New SEO', slug: 'new-slug' },
    });

    expect(updated).toMatchObject({ slug: 'new-slug', seoTitle: 'New SEO', status: 'published' });
    expect(updated.snapshotId).toBe(record('published').snapshotId);
    expect(h.publications.createRevalidation).toHaveBeenCalledWith([
      '/p/current-slug',
      '/p/new-slug',
    ]);
  });
});
