// Local website-admin adapter. Credentials stay in expiring server memory, never public storage.
import type {IncomingMessage,ServerResponse} from 'node:http';
import {randomBytes} from 'node:crypto';
import {page,renderResults,type PublicStore} from './render.ts';
import {latestPublications,type PublicationRecord} from '../lib/live/publication.ts';
type EventScopes=Record<string,{competitionIds:string[];active:boolean}>;
type Session={key:string;csrf:string;expires:number};
const sessions=new Map<string,Session>();
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function authority(key:string,input:Record<string,unknown>){
  const response=await fetch((process.env.LOCAL_OPERATIONAL_URL??'http://127.0.0.1:3000')+'/api/publication-owner',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(30000)});
  const data=await response.json() as {error?:string;publications?:PublicationRecord[];serviceState?:string;pending?:number;events?:EventScopes};
  if(!response.ok)throw new Error(data.error??'The judging app is unavailable. Try again.');return data;
}
function hidden(name:string,value:unknown){return `<input type="hidden" name="${name}" value="${escape(value)}">`;}
function form(session:Session,action:string,body:string,extra=''){return `<form method="post" action="/admin/action">${hidden('csrf',session.csrf)}${hidden('action',action)}${extra}${body}</form>`;}
function login(notice=''){return page(`<div class="page-title"><p class="eyebrow">Website admin</p><h1>Approve competition results</h1><p>Organizers send the results. You review and publish them here.</p></div><section class="card admin-login">${notice?`<p role="alert">${escape(notice)}</p>`:''}<form method="post" action="/admin/login"><label>Admin access code<input type="password" name="credential" autocomplete="current-password" required></label><button>Sign in</button></form><details><summary>About this local preview</summary><p>Use the local admin code for this preview. Connecting the hosted website’s admin sign-in is a separate step.</p></details></section>`,'Admin');}
function renderAdmin(records:PublicationRecord[],session:Session,service:string,notice:string,store:PublicStore,event:string,scopes:EventScopes){
  const events=new Map<string,PublicationRecord[]>();
  for(const item of records){const list=events.get(item.snapshot.eventId)??[];list.push(item);events.set(item.snapshot.eventId,list);}
  const pending=[...events.values()].map(latestPublications).filter((items)=>items.some((p)=>p.status==='requested'||p.status==='queued')).sort((a,b)=>b.reduce((at,p)=>p.snapshot.preparedAt>at?p.snapshot.preparedAt:at,'').localeCompare(a.reduce((at,p)=>p.snapshot.preparedAt>at?p.snapshot.preparedAt:at,'')));
  const selected=event||pending[0]?.[0].snapshot.eventId;
  const selectedRecords=latestPublications(records.filter((p)=>p.snapshot.eventId===selected));
  const completed=selectedRecords.length&&selectedRecords.every((p)=>p.status==='released')?`<section class="card admin-complete"><p class="eyebrow">Published</p><h2>${escape(selectedRecords[0].snapshot.event.name)}</h2><p>Results for this event are published.</p><a class="button" href="/leaderboard?event=${escape(selected)}">View published results</a></section>`:'';
  const filter=pending.length?`<form class="filters" action="/admin"><label>Event to review<select name="event">${completed?`<option value="${escape(selected)}" selected>${escape(selectedRecords[0].snapshot.event.name)} · Published</option>`:''}${pending.map((items)=>`<option value="${escape(items[0].snapshot.eventId)}"${selected===items[0].snapshot.eventId?' selected':''}>${escape(items[0].snapshot.event.name)}</option>`).join('')}</select></label><button>View event</button></form>`:'';
  const cards=pending.filter((items)=>items[0].snapshot.eventId===selected).map((items)=>{
    const scope=scopes[items[0].snapshot.eventId],complete=scope?.active&&scope.competitionIds.length===items.length&&items.every((p)=>scope.competitionIds.includes(p.competitionId));
    const canApprove=complete&&service==='enabled'&&items.every((p)=>['requested','released'].includes(p.status)&&!p.underReview),first=items[0],queued=items.some((p)=>p.status==='queued');
    const manifest=JSON.stringify(items.map((p)=>({publicationId:p.id,sourceFingerprint:p.sourceFingerprint})));
    return `<section class="card admin-request" data-event-id="${escape(first.snapshot.eventId)}"><p class="eyebrow">Organizer request</p><h2>${escape(first.snapshot.event.name)}</h2><p>${escape(first.snapshot.event.venue)}${first.snapshot.event.date?' · '+escape(first.snapshot.event.date):''}</p>${queued?form(session,'retry',service==='enabled'?'<button>Retry sending</button>':'<button disabled>Publication paused</button>'):form(session,'release-event',`<button${canApprove?'':' disabled'}>Approve &amp; publish results</button>`,hidden('publications',manifest)+hidden('event',first.snapshot.eventId))}<p role="status">${service!=='enabled'?'Publication is paused. Resume it in website controls below.':queued?'Approved. Retry sending to finish publication.':canApprove?'One approval publishes all current competition results shown below.':!complete?'The organizer needs to send updated results for the complete event.':'Updated results need organizer review.'}</p><table><thead><tr><th>Competition</th><th>Version</th><th>Status</th></tr></thead><tbody>${items.map((p)=>`<tr><td>${escape(p.snapshot.competition.format)} · ${escape(p.snapshot.competition.division)}</td><td>${p.revision}</td><td>${p.status==='requested'?'Ready for approval':p.status==='released'?'Published':p.status==='queued'?'Sending pending':'Needs review'}</td></tr>`).join('')}</tbody></table>${items.map((p)=>`<div data-publication-id="${escape(p.id)}"><h3>${escape(p.snapshot.competition.format)} · ${escape(p.snapshot.competition.division)}</h3>${p.snapshot.stages.filter((s)=>s.kind==='finals').map((stage)=>`<table><thead><tr><th>Place</th><th>Entrant</th><th>Average</th></tr></thead><tbody>${stage.entrants.filter((e)=>!e.withdrawn).sort((a,b)=>(a.place??999)-(b.place??999)).map((e)=>`<tr><td>${e.place??'—'}</td><td>#${e.number} ${escape(e.primary)}${e.secondary?' &amp; '+escape(e.secondary):''}</td><td>${e.average?.toFixed(4)??'—'}</td></tr>`).join('')}</tbody></table>`).join('')}<details><summary>Prelims &amp; judge scorecards</summary>${renderResults(p,store)}</details></div>`).join('')}</section>`;
  }).join('');
  const released=records.filter((p)=>p.status==='released').reverse();
  return page(`<div class="page-title"><p class="eyebrow">Website admin</p><h1>${completed&&!cards?'Results published':'Results awaiting approval'}</h1><p>${completed&&!cards?'Open the published results below, or choose another event to review.':'Review an event below, then approve all its results with one click.'}</p>${notice?`<p role="status">${escape(notice)}</p>`:''}</div>${filter}${cards||completed||`<section class="empty">${pending.length?'No results are waiting for approval for this event. Choose another event above.':'No results are waiting for approval.'}</section>`}<details class="card admin-supporting"${pending.length&&service!=='enabled'?' open':''}><summary>Publication history &amp; website tools</summary><details><summary>Published results &amp; past versions (${released.length})</summary>${released.map((p)=>`<p>${escape(p.snapshot.event.name)} · ${escape(p.snapshot.competition.format)} · ${escape(p.snapshot.competition.division)} · revision ${p.revision}${p.underReview?' · Under review':''} <a href="/results/${escape(p.id)}">View results</a></p>`).join('')}</details><details class="card"${pending.length&&service!=='enabled'?' open':''}><summary>Sending &amp; website controls</summary><p>Publication is ${service==='enabled'?'available':'paused'}. Judging stays available.</p>${form(session,'retry','<button>Retry sending</button>')}${['enabled','suspended','shutdown'].map((state)=>form(session,'service',`<button>${state==='enabled'?'Resume publication':state==='suspended'?'Pause publication':'Record hosting shutdown'}</button>`,hidden('state',state))).join('')}<p>Published history remains available while hosted. Shutdown notice is 30 days where practicable.</p></details></details>${form(session,'logout','<button>Sign out</button>')}`,'Admin');
}
export async function adminRoute(req:IncomingMessage,res:ServerResponse,url:URL,store:PublicStore){
  if(!url.pathname.startsWith('/admin'))return false;
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Type','text/html;charset=utf-8');
  for(const [id,session]of sessions)if(session.expires<Date.now())sessions.delete(id);
  const token=req.headers.cookie?.split(';').map((c)=>c.trim()).find((c)=>c.startsWith('cdj_admin='))?.slice(10),session=token?sessions.get(token):undefined;
  const send=(html:string,status=200)=>{res.writeHead(status).end(html);};
  try{
    if(req.method==='GET'&&url.pathname==='/admin'){
      if(!session){send(login());return true;}
      const data=await authority(session.key,{action:'list'});send(renderAdmin(data.publications??[],session,data.serviceState??'enabled',url.searchParams.get('notice')??'',store,url.searchParams.get('event')??'',data.events??{}));return true;
    }
    if(req.method!=='POST'||!['/admin/login','/admin/action'].includes(url.pathname)){send('Not found',404);return true;}
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)throw new Error('Request too large.');}
    if(req.headers.origin!==url.origin || req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded'){send('Use this website’s admin controls.',403);return true;}
    const fields=new URLSearchParams(raw);
    if(url.pathname==='/admin/login'){
      const key=fields.get('credential')??'';
      if(key.length>300){send(login('Check your admin credential.'),403);return true;}
      try{await authority(key,{action:'list'});}catch{send(login('Sign-in failed. Check your credential and that the judging app is running.'),403);return true;}
      if(sessions.size>=50){send(login('Too many active admin sessions. Try later.'),429);return true;}
      const id=randomBytes(32).toString('hex');sessions.set(id,{key,csrf:randomBytes(32).toString('hex'),expires:Date.now()+8*60*60*1000});
      if(token)sessions.delete(token);
      res.setHeader('Set-Cookie',`cdj_admin=${id}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=28800`);res.writeHead(303,{Location:'/admin'}).end();return true;
    }
    if(!session || fields.get('csrf')!==session.csrf){send('Sign in again before approving results.',403);return true;}
    const action=fields.get('action');
    if(action==='logout'){sessions.delete(token!);res.setHeader('Set-Cookie','cdj_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0');res.writeHead(303,{Location:'/admin'}).end();return true;}
    if(!['release-event','retry','service'].includes(action??'')){send('Unknown action.',400);return true;}
    const data=await authority(session.key,{action,...(action==='release-event'?{publications:JSON.parse(fields.get('publications')??'null')}:{state:fields.get('state')})});
    const notice=data.pending?'Approval saved. Sending is pending; use Retry sending.':action==='release-event'?'Approved and published. The results are now on this website.':action==='retry'?'Sending checked.':'Website setting saved.';
    res.writeHead(303,{Location:'/admin?notice='+encodeURIComponent(notice)+'&event='+encodeURIComponent(fields.get('event')??'')}).end();
  }catch(error){send(page(`<div class="page-title"><h1>Results were not published</h1><p role="alert">${escape(error instanceof Error?error.message:'Try again.')}</p><a href="/admin">Return to admin review</a></div>`,'Admin'),409);}
  return true;
}
