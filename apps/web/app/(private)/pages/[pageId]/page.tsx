import { WorkspacePage } from '@/pages/workspace';

type PageRoutePageProps = Readonly<{
  params: Promise<{ pageId: string }>;
}>;

export default async function PageRoutePage({ params }: PageRoutePageProps) {
  const { pageId } = await params;
  return <WorkspacePage route={{ pageId, type: 'page' }} />;
}
