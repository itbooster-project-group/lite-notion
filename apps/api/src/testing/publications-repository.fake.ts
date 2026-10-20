import type { PublicationsRepository } from '../publications/publications.repository';

/** Minimal fake for lifecycle tests that do not create publication rows. */
export function emptyPublicationsRepository(): PublicationsRepository {
  const repository = {
    bind: () => repository,
    findPublishedPageSlugs: async () => [],
    markPublishedUnpublished: async () => undefined,
    createRevalidation: async () => undefined,
  };
  return repository as unknown as PublicationsRepository;
}
