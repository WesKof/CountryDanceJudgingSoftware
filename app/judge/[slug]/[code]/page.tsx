import JudgeBallot from '@/components/live/judge';
import { getDb } from '@/db';
import { readLive } from '@/lib/live/server';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let role: string | undefined;
  try { role=(await readLive(getDb(),code)).role; } catch { /* Deny before constructing a role interface. */ }
  if(!role) return <main><h1>Private link unavailable</h1><p>This link is invalid, revoked, or storage is temporarily unavailable.</p></main>;
  if(role === 'organizer') return <main><h1>Individual judge access required</h1><p>Open the intended judge’s private link from Set-Up.</p></main>;
  return <JudgeBallot token={code} />;
}
