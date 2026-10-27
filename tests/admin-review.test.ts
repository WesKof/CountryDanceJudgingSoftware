import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminRoute } from '../public-site/admin.ts';
import type { PublicationRecord } from '../lib/live/publication.ts';
import type { PublicStore } from '../public-site/render.ts';
import {adminAcknowledgement} from '../lib/live/admin-ack.ts';

function publication(event = 'event-a', competition = 'competition-a', status: PublicationRecord['status'] = 'requested'): PublicationRecord {
  const id = event + '-' + competition;
  return { id, revision: 1, competitionId: competition, sourceFingerprint: 'fingerprint-' + id, status,
    ...(['requested','queued','released'].includes(status)?{organizerApprovedAt:'2026-10-24T11:30:00Z'}:{}),...(['queued','released'].includes(status)?{ownerApprovedAt:'2026-10-24T11:45:00Z'}:{}),...(status === 'released' ? { releasedAt: '2026-10-24T12:00:00Z' } : {}),
    snapshot: { schemaVersion: 1, scoringVersion: 'equal-judge-stage-v1', id, revision: 1, supersedes: null,
      eventId: event, competitionId: competition, event: { name: 'Synthetic ' + event, venue: 'Local hall', date: '2026-10-24' },
      competition: { format: 'Strictly', division: 'Beginner' }, sourceFingerprint: 'fingerprint-' + id,
      preparedAt: '2026-10-24T11:00:00Z', headApproval: [], changeSummary: 'Synthetic adapter fixture', stages: [] } };
}

type Authority = { publications: PublicationRecord[]; serviceState: string; enabled:boolean; events: Record<string, { competitionIds: string[]; active: boolean }>; pending?: number };
function authority(records: PublicationRecord[] = [], service = 'enabled'): Authority {
  const events: Authority['events'] = {};
  for (const record of records) {
    const scope = events[record.snapshot.eventId] ??= { competitionIds: [], active: true };
    scope.competitionIds.push(record.competitionId);
  }
  return { publications: records, serviceState: service, enabled:service==='enabled', events };
}

async function harness(state: Authority, run: (session: { get: (query?: string) => Promise<{ html: string; status: number }>; request: typeof request; cookie: string; csrf: () => string; calls: Record<string, unknown>[] }) => Promise<void>) {
  const original = globalThis.fetch, calls: Record<string, unknown>[] = [], store: PublicStore = { records: {}, current: {} };
  const origin = 'http://127.0.0.1:3110';
  globalThis.fetch = async (_input, init) => {
    const message=JSON.parse(String(init?.body)),operation={...message};delete operation.adminRequest;
    calls.push(operation);
    if(new Headers(init?.headers).get('Authorization')!=='Bearer synthetic-adapter-only')return Response.json({error:'Synthetic sign-in rejected'},{status:403});
    const data=operation.action==='list'?{publications:state.publications,events:state.events,enabled:state.enabled,serviceState:state.serviceState}:operation.action==='service'?{ok:true,state:operation.state}:{ok:true,delivered:0,pending:state.pending??0};
    return Response.json({...data,adminAcknowledgement:await adminAcknowledgement(message)});
  };
  async function request(path: string, method = 'GET', body = '', cookie = '', requestOrigin = origin) {
    const req = Readable.from(body ? [body] : []) as IncomingMessage;
    req.method = method; req.headers = { cookie, origin: requestOrigin, 'content-type': 'application/x-www-form-urlencoded' };
    const result = { html: '', status: 0, headers: new Map<string, string>() };
    const res = {
      setHeader(name: string, value: string) { result.headers.set(name.toLowerCase(), value); return this; },
      writeHead(status: number, headers?: Record<string, string>) { result.status = status; for (const [key, value] of Object.entries(headers ?? {})) result.headers.set(key.toLowerCase(), value); return this; },
      end(html = '') { result.html = html; return this; },
    };
    assert.equal(await adminRoute(req, res as unknown as ServerResponse, new URL(path, origin), store), true);
    return result;
  }
  let cookie = '', csrf = '';
  try {
    const login = await request('/admin/login', 'POST', new URLSearchParams({ credential: 'synthetic-adapter-only' }).toString());
    assert.equal(login.status, 303);
    assert.ok(login.headers.get('set-cookie')?.includes('HttpOnly; SameSite=Strict; Path=/admin; Max-Age=28800'));
    cookie = login.headers.get('set-cookie')!.split(';')[0];
    const get = async (query = '') => {
      const response = await request('/admin' + query, 'GET', '', cookie);
      csrf = /name="csrf" value="([^"]+)"/.exec(response.html)?.[1] ?? csrf;
      return response;
    };
    await run({ get, request, cookie, csrf: () => csrf, calls });
  } finally {
    if (cookie && csrf) await request('/admin/action', 'POST', new URLSearchParams({ action: 'logout', csrf }).toString(), cookie);
    globalThis.fetch = original;
  }
}

const heading = (html: string) => /<h1>(.*?)<\/h1>/.exec(html)?.[1];
const has = (html: string, text: string) => assert.ok(html.includes(text), 'Expected admin presentation: ' + text);
const lacks = (html: string, text: string) => assert.ok(!html.includes(text), 'Unexpected admin presentation: ' + text);

test('empty admin queue has honest current state without approval instructions or redundant navigation', async () => {
  await harness(authority(), async ({ get, calls }) => {
    const { html, status } = await get(); assert.equal(status, 200);
    assert.equal(heading(html), 'No results to review');
    lacks(html, 'Review an event below, then approve'); lacks(html, 'Event to review'); lacks(html, 'class="admin-request"');
    has(html, 'The organizer will send results here when an event is ready.');
    assert.equal(calls.length, 2);
  });
});

test('one selected pending event skips only redundant navigation and preserves exact approval fields', async () => {
  const first = publication(), second = publication('event-a', 'competition-b');
  await harness(authority([first, second]), async ({ get }) => {
    const { html } = await get(); assert.equal(heading(html), 'Results ready for review'); lacks(html, 'Event to review');
    has(html, '<button>Approve &amp; publish results</button>');
    has(html, 'name="event" value="event-a"'); has(html, 'name="action" value="release-event"'); has(html, 'name="csrf"');
    const raw = /name="publications" value="([^"]+)"/.exec(html)![1].replaceAll('&quot;', '"');
    assert.deepEqual(JSON.parse(raw), [first, second].map(record => ({ publicationId: record.id, sourceFingerprint: record.sourceFingerprint })));
  });
});

test('multiple pending, completed selection and stale selection preserve necessary event navigation', async () => {
  const first = publication(), second = publication('event-b'), completed = publication('event-c', 'competition-a', 'released');
  await harness(authority([first, second, completed]), async ({ get }) => {
    const multi = await get(); has(multi.html, 'Event to review');
    const done = await get('?event=event-c'); assert.equal(heading(done.html), 'Results published'); has(done.html, 'Event to review');
    has(done.html, 'View published results'); lacks(done.html, 'name="action" value="release-event"');
    const stale = await get('?event=missing'); assert.equal(heading(stale.html), 'No results to review for this event');
    has(stale.html, 'Event to review'); has(stale.html, '<option value="" disabled selected>Choose an event</option>');
    lacks(stale.html, 'then approve all');
  });
  await harness(authority([first, completed]), async ({ get }) => {
    has((await get('?event=event-c')).html, 'Event to review'); has((await get('?event=missing')).html, 'Event to review');
  });
});

test('waiting admin states omit inactive approval while queued and paused controls remain exact', async () => {
  const record = publication(), state = authority([record]); state.events['event-a'].competitionIds.push('missing-competition');
  await harness(state, async ({ get }) => {
    const { html } = await get(); assert.equal(heading(html), 'Waiting for updated results');
    lacks(html, 'Approve &amp; publish results'); lacks(html, 'name="action" value="release-event"');
    has(html, 'Organizer update needed'); has(html, 'organizer needs to send updated results');
  });
  const underReview = publication(); underReview.underReview = true;
  await harness(authority([underReview]), async ({ get }) => {
    const { html } = await get(); assert.equal(heading(html), 'Waiting for updated results'); has(html, 'Updated results need organizer review.');
    lacks(html, 'Approve &amp; publish results'); lacks(html, 'name="publications"');
  });
  await harness(authority([publication('event-a', 'competition-a', 'queued')]), async ({ get }) => {
    const { html } = await get(); assert.equal(heading(html), 'Sending pending'); has(html, 'Sending has not finished. Use Retry sending.');
    lacks(html, 'name="action" value="release-event"'); has(html, 'name="action" value="retry"');
  });
  for (const service of ['shutdown']) await harness(authority([record], service), async ({ get }) => {
    const { html } = await get(); assert.equal(heading(html), 'Publication paused'); has(html, 'Resume it in website controls below.');
    has(html, '<button disabled>Approve &amp; publish results</button>'); has(html, 'class="card admin-supporting" open');
    has(html, 'name="action" value="release-event"'); has(html, 'name="event" value="event-a"'); has(html, 'name="csrf"');
    const raw = /name="publications" value="([^"]+)"/.exec(html)![1].replaceAll('&quot;', '"');
    assert.deepEqual(JSON.parse(raw), [{ publicationId: record.id, sourceFingerprint: record.sourceFingerprint }]);
  });
  await harness(authority([publication('event-a', 'competition-a', 'queued')], 'suspended'), async ({ get }) => {
    const { html } = await get(); assert.equal(heading(html), 'Publication paused');
    const primary = html.slice(html.indexOf('<section class="card admin-request"'), html.indexOf('<table'));
    has(primary, '<button>Resume website publication</button>'); has(primary, 'Sending can continue after resuming website publication.');
    lacks(primary, 'name="action" value="retry"'); lacks(primary, 'name="action" value="release-event"');
    has(html, 'id="website-controls"'); has(html, '<button>Retry sending</button>');
  });
});

test('suspended selected review has a global Resume with exact context while optional controls stay available', async () => {
  const first = publication('event-a'), selected = publication('event-b');
  await harness(authority([first, selected], 'suspended'), async ({ get, request, cookie, csrf, calls }) => {
    const { html } = await get('?event=event-b');
    const primary = html.slice(html.indexOf('<section class="card admin-request"'), html.indexOf('<table'));
    assert.equal(heading(html), 'Publication paused');
    has(html, 'Resume website publication for all events.'); has(primary, 'Results still need separate approval.');
    has(primary, '<button>Resume website publication</button>'); has(primary, 'name="action" value="service"');
    has(primary, 'name="state" value="enabled"'); has(primary, 'name="event" value="event-b"'); has(primary, 'name="csrf"');
    lacks(primary, 'name="action" value="release-event"'); lacks(primary, 'name="action" value="retry"');
    has(html, '<details class="card admin-supporting"><summary>'); has(html, '<details id="website-controls" class="card"><summary>');
    has(html, '<button>Pause publication</button>'); has(html, '<button>Record hosting shutdown</button>');
    const response = await request('/admin/action', 'POST', new URLSearchParams({ action: 'service', state: 'enabled', event: 'event-b', csrf: csrf() }).toString(), cookie);
    assert.equal(response.status, 303); const target = new URL(response.headers.get('location')!, 'http://127.0.0.1:3110');
    assert.equal(target.origin, 'http://127.0.0.1:3110'); assert.equal(target.pathname, '/admin'); assert.equal(target.searchParams.get('event'), 'event-b');
    assert.deepEqual(calls.at(-1), { action: 'service', state: 'enabled' });
    const unavailable = await get('?event=missing'); lacks(unavailable.html, '<button>Resume website publication</button>');
    has(unavailable.html, 'class="card admin-supporting" open');
  });
});

test('admin session, CSRF, origin and exact action forwarding stay independent of presentation', async () => {
  const record = publication();
  await harness(authority([record]), async ({ get, request, cookie, csrf, calls }) => {
    await get(); const count = calls.length;
    assert.equal((await request('/admin/action', 'POST', new URLSearchParams({ action: 'retry', csrf: 'incorrect' }).toString(), cookie)).status, 403);
    assert.equal((await request('/admin/action', 'POST', new URLSearchParams({ action: 'retry', csrf: csrf() }).toString(), cookie, 'http://untrusted.invalid')).status, 403);
    assert.equal(calls.length, count);
    const publications = [{ publicationId: record.id, sourceFingerprint: record.sourceFingerprint }];
    const response = await request('/admin/action', 'POST', new URLSearchParams({ action: 'release-event', csrf: csrf(), event: 'event-a', publications: JSON.stringify(publications) }).toString(), cookie);
    assert.equal(response.status, 303); assert.deepEqual(calls.at(-2), { action: 'release-event', publications, eventId:'event-a' }); assert.deepEqual(calls.at(-1),{action:'list'});
    for (const [action, state] of [['retry', ''], ['service', 'suspended']]) {
      assert.equal((await request('/admin/action', 'POST', new URLSearchParams({ action, state, csrf: csrf() }).toString(), cookie)).status, 303);
      assert.deepEqual(calls.at(-1), action==='service'?{ action, state }:{action});
    }
  });
});

test('admin sign-in keeps selected completed, pending, stale and literal event context on a fixed local destination', async () => {
  const records=[publication('pending-a'),publication('pending-b'),publication('completed','competition-a','released')];
  const state=authority(records),before=JSON.stringify(state);
  await harness(state,async({get,request,calls})=>{
    await get();
    for(const event of ['completed','pending-a','pending-b','missing','<Friends> & "Family"','https://untrusted.invalid/path?next=/admin','//untrusted.invalid','event\r\nLocation: https://untrusted.invalid']){
      const anonymous=await request('/admin?event='+encodeURIComponent(event));
      const field=/name="event" value="([^"]*)"/.exec(anonymous.html);
      assert.ok(Boolean(field),'Anonymous event login must preserve event context');
      assert.equal(field![1],event.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'));
      lacks(anonymous.html,'<Friends>');lacks(anonymous.html,'type="password" value=');
      const login=await request('/admin/login','POST',new URLSearchParams({credential:'synthetic-adapter-only',event,returnTo:'https://untrusted.invalid'}).toString());
      assert.equal(login.status,303);
      const target=new URL(login.headers.get('location')!,'http://127.0.0.1:3110');
      assert.equal(target.origin,'http://127.0.0.1:3110');assert.equal(target.pathname,'/admin');assert.equal(target.searchParams.get('event'),event);assert.equal(target.hash,'');
      const cookie=login.headers.get('set-cookie')!.split(';')[0],selected=await request(target.pathname+target.search,'GET','',cookie);
      if(event==='completed')assert.equal(heading(selected.html),'Results published');
      if(event.startsWith('pending-'))has(selected.html,`data-event-id="${event}"`);
      if(!records.some(record=>record.snapshot.eventId===event))assert.equal(heading(selected.html),'No results to review for this event');
      const csrf=/name="csrf" value="([^"]+)"/.exec(selected.html)![1];
      await request('/admin/action','POST',new URLSearchParams({action:'logout',csrf}).toString(),cookie);
    }
    assert.ok(calls.every(call=>call.action==='list'),'Sign-in/navigation cannot forward approval actions');assert.equal(JSON.stringify(state),before);
  });
});

test('failed admin sign-in retains event for retry without retaining or reflecting the entered credential', async()=>{
  await harness(authority([publication('pending-a'),publication('completed','competition-a','released')]),async({get,request})=>{
    await get();
    for(const credential of ['synthetic-wrong-credential', 'x'.repeat(301)]){
      const failed=await request('/admin/login','POST',new URLSearchParams({credential,event:'completed'}).toString());
      assert.equal(failed.status,403);has(failed.html,'name="event" value="completed"');lacks(failed.html,credential);lacks(failed.html,'type="password" value=');
      assert.equal(failed.headers.has('set-cookie'),false);
    }
    const ordinary=await request('/admin');lacks(ordinary.html,'name="event"');
    const blank=await request('/admin/login','POST',new URLSearchParams({credential:'synthetic-adapter-only',event:''}).toString());
    assert.equal(blank.headers.get('location'),'/admin');
    const cookie=blank.headers.get('set-cookie')!.split(';')[0],view=await request('/admin','GET','',cookie),csrf=/name="csrf" value="([^"]+)"/.exec(view.html)![1];
    has(view.html,'data-event-id="pending-a"');await request('/admin/action','POST',new URLSearchParams({action:'logout',csrf}).toString(),cookie);
  });
});

test('malformed successful list replies never create a session or render a false empty queue',async()=>{
  await harness(authority(),async({get,request,cookie})=>{
    await get();const valid=globalThis.fetch;
    try{
      for(const change of [()=>({}), (v:Record<string,unknown>)=>({...v,constructor:true}), (v:Record<string,unknown>)=>({...v,serviceState:['enabled']}), (v:Record<string,unknown>)=>({...v,adminAcknowledgement:{}})]){
        globalThis.fetch=async(input,init)=>{const response=await valid(input,init);return Response.json(change(await response.json() as Record<string,unknown>));};
        const login=await request('/admin/login','POST',new URLSearchParams({credential:'synthetic-adapter-only',event:'event-a'}).toString());assert.equal(login.status,403);assert.equal(login.headers.has('set-cookie'),false);has(login.html,'name="event" value="event-a"');
        const page=await request('/admin?event=event-a','GET','',cookie);assert.equal(page.status,409);has(page.html,'Website status was not confirmed');lacks(page.html,'No results to review');lacks(page.html,'An action may already have been saved');has(page.html,'href="/admin?event=event-a"');
      }
    }finally{globalThis.fetch=valid;}
  });
});

test('wrong action acknowledgement or failed post-release check preserves event and reports uncertainty',async()=>{
  const p=publication(),state=authority([p]);
  await harness(state,async({get,request,cookie,csrf})=>{
    await get();const valid=globalThis.fetch;const body=(action:string)=>new URLSearchParams({action,event:'event-a',state:'suspended',publications:JSON.stringify([{publicationId:p.id,sourceFingerprint:p.sourceFingerprint}]),csrf:csrf()}).toString();
    try{
      for(const mode of ['empty','wrong-state','wrong-ack','post-list']){
        let acted=false;globalThis.fetch=async(input,init)=>{const operation=JSON.parse(String(init?.body));const response=await valid(input,init);const data=await response.json() as Record<string,unknown>;if(operation.action!=='list'){acted=true;if(mode==='empty')return Response.json({});if(mode==='wrong-state')return Response.json({...data,state:'enabled'});if(mode==='wrong-ack')return Response.json({...data,adminAcknowledgement:{}});}else if(acted&&mode==='post-list')return Response.json({});return Response.json(data);};
        const result=await request('/admin/action','POST',body(mode==='post-list'?'release-event':'service'),cookie);assert.equal(result.status,409);assert.equal(result.headers.has('location'),false);assert.equal(result.headers.has('set-cookie'),false);has(result.html,'href="/admin?event=event-a"');lacks(result.html,'Results were not published');has(result.html,'Check the current status');
      }
    }finally{globalThis.fetch=valid;}
  });
});

test('fresh selected-event confirmation uses genuine different competition IDs and ignores global pending',async()=>{
  const p=publication(),state=authority([p]);p.snapshot.competitionId='hashed-public-competition';
  await harness(state,async({get,request,cookie,csrf})=>{
    await get();const valid=globalThis.fetch;
    try{globalThis.fetch=async(input,init)=>{const operation=JSON.parse(String(init?.body));if(operation.action==='release-event'){p.status='released';p.organizerApprovedAt='2026-10-27T12:00:00Z';p.ownerApprovedAt='2026-10-27T12:01:00Z';p.releasedAt='2026-10-27T12:02:00Z';state.pending=7;}return valid(input,init);};
      const result=await request('/admin/action','POST',new URLSearchParams({action:'release-event',event:'event-a',csrf:csrf(),publications:JSON.stringify([{publicationId:p.id,sourceFingerprint:p.sourceFingerprint}])}).toString(),cookie);
      assert.equal(result.status,303);const destination=new URL(result.headers.get('location')!,'http://127.0.0.1:3110');assert.equal(destination.searchParams.get('event'),'event-a');assert.match(destination.searchParams.get('notice')!,/Confirmed: this event/);
    }finally{globalThis.fetch=valid;}
  });
});

test('expired session still rejects actions before authority calls',async()=>{
  await harness(authority(),async({get,request,cookie,csrf,calls})=>{await get();const now=Date.now,count=calls.length;try{const later=now()+8*60*60*1000+1;Date.now=()=>later;assert.equal((await request('/admin/action','POST',new URLSearchParams({action:'retry',csrf:csrf()}).toString(),cookie)).status,403);assert.equal(calls.length,count);}finally{Date.now=now;}});
});

test('current admin view does not call incomplete, under-review or archived history a completed publication',async()=>{
  for(const mode of ['incomplete','review','archived']){
    const p=publication('event-a','competition-a','released'),state=authority([p]);if(mode==='incomplete')state.events['event-a'].competitionIds.push('new-competition');if(mode==='review')p.underReview=true;if(mode==='archived')state.events['event-a'].active=false;
    await harness(state,async({get})=>{const view=await get('?event=event-a&notice='+encodeURIComponent('Confirmed: this event’s results are published.'));assert.equal(view.status,200);lacks(view.html,'<h1>Results published</h1>');lacks(view.html,'Results for this event are published.');lacks(view.html,'Confirmed: this event’s results are published.');has(view.html,'The event changed since the last check.');});
  }
});

test('unknown and legacy query notices cannot inject publication success, while known notices remain contextual',async()=>{
  await harness(authority([publication()]),async({get})=>{
    for(const notice of ['Approved and published. The results are now on this website.','FORGED_STATUS_SENTINEL','Confirmed: this event\'s results are published.']){
      const view=await get('?event=event-a&notice='+encodeURIComponent(notice));assert.equal(view.status,200);lacks(view.html,notice);lacks(view.html,'<h1>Results published</h1>');
    }
    const pending=await get('?event=event-a&notice='+encodeURIComponent('This event’s approval is confirmed. Sending is pending; use Retry sending.'));lacks(pending.html,'This event’s approval is confirmed.');has(pending.html,'The event changed since the last check.');
    const valid=await get('?event=event-a&notice='+encodeURIComponent('Website setting confirmed.'));has(valid.html,'Website setting confirmed.');
  });
});
