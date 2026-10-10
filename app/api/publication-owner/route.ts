import { getDb } from '@/db';
import { ownerPublication } from '@/lib/live/server';
import { localPublisher } from '@/lib/live/local-publisher';
import { LiveError, record } from '@/lib/live/validation';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
  try {
    // Drain valid-sized POST bodies before authorization rejection. Workerd's local
    // keep-alive proxy otherwise invalidates the next request on that connection.
    const raw=await request.text();if(raw.length>20000)throw new LiveError(413,'Request too large.');
    const config=localPublisher(request),origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) throw new LiveError(403,'Use the results website admin page.');
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new LiveError(415,'Send JSON.');
    return Response.json(await ownerPublication(getDb(),record(JSON.parse(raw)),config),{headers});
  }catch(error){return Response.json({error:error instanceof LiveError ? error.message : 'Local publisher unavailable; operational judging remains available.'},{status:error instanceof LiveError ? error.status : 503,headers});}
}
