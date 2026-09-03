import { AssessmentFlow } from './AssessmentFlow';

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssessmentFlow sessionId={id} />;
}
