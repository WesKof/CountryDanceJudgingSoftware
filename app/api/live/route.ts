import { getDb } from '@/db';
import { mutateLive, readEventSummary, readLive } from '@/lib/live/server';
import { LiveError } from '@/lib/live/validation';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
function code(request: Request) { return request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''; }
function failure(error: unknown) {
  if (error instanceof LiveError) return Response.json({ error: error.message, details: error.details }, { status: error.status, headers });
  // Deliberately no raw request/database logging; private paths and notes must not enter logs.
  return Response.json({ error: 'Shared storage is temporarily unavailable. Keep this page open; pending edits can be retried.' }, { status: 503, headers });
}
export async function GET(request: Request) {
  try { return Response.json(await (new URL(request.url).searchParams.get('summary') === '1' ? readEventSummary(getDb(), code(request)) : readLive(getDb(), code(request))), { headers }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new LiveError(403, 'Use the event website to make changes.');
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new LiveError(415, 'Send JSON.');
    if (Number(request.headers.get('content-length') ?? 0) > 1500000) throw new LiveError(413, 'The event file is too large.');
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 1500000) throw new LiveError(413, 'The event file is too large.');
    let input: unknown; try { input = JSON.parse(body); } catch { throw new LiveError(400, 'Invalid event data.'); }
    return Response.json(await mutateLive(getDb(), code(request), input), { headers });
  } catch (error) { return failure(error); }
}
