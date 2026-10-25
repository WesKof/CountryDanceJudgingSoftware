import LiveDesk from '@/components/live/desk';
import { getDb } from '@/db';
import { readLive } from '@/lib/live/server';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let role: string | undefined;
  try { role=(await readLive(getDb(),code)).role; } catch { /* Deny before constructing a role interface. */ }
  if(!role) return <main><h1>Private link unavailable</h1><p>This link is invalid, revoked, or storage is temporarily unavailable.</p></main>;
  if(role !== 'organizer') return <main><h1>Organizer access required</h1><p>Use your individual judge page for assigned work.</p></main>;
  return <LiveDesk key={code} token={code} />;
}
