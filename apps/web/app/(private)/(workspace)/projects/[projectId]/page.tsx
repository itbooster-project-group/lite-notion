import { WorkspacePage } from '@/pages/workspace';

type ProjectRoutePageProps = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

export default async function ProjectRoutePage({ params }: ProjectRoutePageProps) {
  const { projectId } = await params;
  return <WorkspacePage route={{ projectId, type: 'project' }} />;
}
