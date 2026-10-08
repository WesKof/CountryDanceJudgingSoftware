import JudgeBallot from '@/components/live/judge';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ code: string }> }) { const { code } = await params; return <JudgeBallot token={code} />; }
