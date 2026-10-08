import LiveDesk from '@/components/live/desk';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ code: string }> }) { const { code } = await params; return <LiveDesk token={code} />; }
