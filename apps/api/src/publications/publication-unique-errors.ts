import { Prisma } from '../generated/prisma/client';

const PUBLICATION_SLUG_CONSTRAINT = 'PagePublication_slug_key';

export function isPublicationSlugUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  const modelName = error.meta?.modelName;
  if (typeof modelName === 'string' && modelName !== 'PagePublication') return false;

  const target = error.meta?.target;
  if (target === PUBLICATION_SLUG_CONSTRAINT || target === 'slug') return true;
  if (Array.isArray(target) && target.length === 1 && target[0] === 'slug') return true;

  const adapterError = error.meta?.driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null || !('cause' in adapterError)) {
    return false;
  }
  const cause = adapterError.cause;
  if (typeof cause !== 'object' || cause === null || !('constraint' in cause)) return false;
  const constraint = cause.constraint;
  if (typeof constraint === 'string') return constraint === PUBLICATION_SLUG_CONSTRAINT;
  if (typeof constraint !== 'object' || constraint === null || !('fields' in constraint)) {
    return false;
  }
  const fields = constraint.fields;
  return Array.isArray(fields) && fields.length === 1 && fields[0] === 'slug';
}
