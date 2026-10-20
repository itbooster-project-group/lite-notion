import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicPublication, PublicationPage } from '@/pages/publication';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PublicationRouteProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({ params }: PublicationRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const publication = await loadPublicPublication(slug);
  if (!publication) notFound();

  return {
    title: publication.dto.seoTitle || publication.dto.title,
    ...(publication.dto.seoDescription ? { description: publication.dto.seoDescription } : {}),
    robots: { index: true, follow: true },
  };
}

export default async function PublicPublicationRoute({ params }: PublicationRouteProps) {
  const { slug } = await params;
  const publication = await loadPublicPublication(slug);
  if (!publication) notFound();

  return <PublicationPage publication={publication} />;
}
