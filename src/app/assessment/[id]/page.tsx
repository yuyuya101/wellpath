import { AssessmentFlow } from './AssessmentFlow';

export default async function AssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <AssessmentFlow sessionId={id} editMode={sp.edit === '1'} />;
}
