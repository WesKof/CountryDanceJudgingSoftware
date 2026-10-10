// Local-only receiver: separate origin and persistent public store, no operational DB access.
import {createServer} from 'node:http';
import {adminRoute} from '../public-site/admin.ts';
import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {page,renderResults,renderIndex,renderAbout} from '../public-site/render.ts';
import {validatePublicSnapshot,snapshotFingerprint,type PublicationRecord} from '../lib/live/publication.ts';
const port=Number(process.env.FAKE_PUBLISHER_PORT ?? 3100),key=process.env.LOCAL_RECEIVER_KEY;
if(!key)throw new Error('Use a local synthetic receiver credential.');
const file=resolve(process.env.FAKE_PUBLISHER_STORE ?? 'work/public-receiver.json');mkdirSync(dirname(file),{recursive:true});
type Store={receipts:Record<string,string>;records:Record<string,PublicationRecord>;current:Record<string,string>;notices?:Record<string,{eventId:string;competitionId:string;revision:number}>};
let unavailable=false;
let deliveryQueue=Promise.resolve();
let store:Store=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{receipts:{},records:{},current:{}};
function persist(next:Store){writeFileSync(file+'.tmp',JSON.stringify(next));renameSync(file+'.tmp',file);store=next;}
createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  const url=new URL(req.url ?? '/',`http://127.0.0.1:${port}`);
  if(await adminRoute(req,res,url,store))return;
  if(req.method==='POST'&&url.pathname==='/test/fault' && req.headers.authorization===`Bearer ${key}`) {let raw='';for await(const chunk of req)raw+=chunk;unavailable=JSON.parse(raw).unavailable===true;res.writeHead(200).end('{}');return;}
  if(req.method==='GET'&&url.pathname==='/community-logo.jpg'){res.setHeader('Content-Type','image/jpeg');res.end(readFileSync(resolve('public/kickinit-community-logo.jpg')));return;}
  if(req.method==='GET' && ['/styles.css','/assets/community-night.jpg','/assets/community-friends.jpg'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css;charset=utf-8':'image/jpeg');res.end(readFileSync(resolve('public-site'+url.pathname)));return;}
  if(req.method==='POST'&&url.pathname==='/receive'){
    if(unavailable){res.writeHead(503).end('{}');return;}
    if(req.headers.authorization!==`Bearer ${key}`){res.writeHead(403).end();return;}
    const previous=deliveryQueue;let unlock!:()=>void;deliveryQueue=new Promise<void>((resolve)=>{unlock=resolve;});await previous;
    try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1500000)throw new Error('Oversized');}const message=JSON.parse(raw),signature=JSON.stringify(message);
      if(store.receipts[message.deliveryId]){if(store.receipts[message.deliveryId]!==signature)throw new Error('Retry differs');res.writeHead(200).end('{}');return;}
      const next=structuredClone(store);
      if(message.kind==='release'||message.kind==='release-set'){
        const records:PublicationRecord[]=message.kind==='release-set'?message.payload:[message.payload];
        if(!Array.isArray(records)||!records.length||records.length>8||new Set(records.map((r)=>r.snapshot.competitionId)).size!==records.length||records.some((r)=>r.snapshot.eventId!==records[0].snapshot.eventId))throw new Error('Invalid event set');
        for(const record of records){validatePublicSnapshot(record.snapshot);if(await snapshotFingerprint(record.snapshot)!==record.sourceFingerprint)throw new Error('Payload differs from approved fingerprint');
        if(record.id!==record.snapshot.id||record.revision!==record.snapshot.revision)throw new Error('Mismatched identity');
        if(!record.ownerApprovedAt||!record.organizerApprovedAt||record.status!=='queued'||record.sourceFingerprint!==record.snapshot.sourceFingerprint)throw new Error('Unauthorized release');
        const authority=await fetch((process.env.LOCAL_OPERATIONAL_URL ?? 'http://127.0.0.1:3000')+'/api/publication-source',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({publicationId:record.id,sourceFingerprint:record.sourceFingerprint,revision:record.revision,eventId:record.snapshot.eventId,competitionId:record.snapshot.competitionId}),signal:AbortSignal.timeout(3000)});
        if(!authority.ok||(await authority.json() as {valid?:boolean}).valid!==true)throw new Error('Current source approval unavailable');
        const scope=record.snapshot.eventId+'/'+record.snapshot.competitionId,current=next.records[next.current[scope]];
        if(record.revision!==(current?.revision ?? 0)+1||record.snapshot.supersedes!==(current?.id ?? null)||next.records[record.id])throw new Error('Duplicate/out-of-order/cross-event revision');
        const at=new Date().toISOString();next.records[record.id]={...record,status:'released',releasedAt:at,lastSynchronizedAt:at,underReview:next.notices?.[record.id]?.eventId===record.snapshot.eventId && next.notices?.[record.id]?.competitionId===record.snapshot.competitionId && next.notices?.[record.id]?.revision===record.revision};next.current[scope]=record.id;
        }
      }else if(message.kind==='status'){
        const p=message.payload,r=next.records[p.id];if(r&&(r.revision!==p.revision||r.snapshot.eventId!==p.eventId||r.snapshot.competitionId!==p.competitionId))throw new Error('Unknown status source');next.notices ??= {};next.notices[p.id]={eventId:p.eventId,competitionId:p.competitionId,revision:p.revision};if(r)next.records[p.id]={...r,underReview:true,lastSynchronizedAt:new Date().toISOString()};
      }else throw new Error('Unknown delivery');
      next.receipts[message.deliveryId]=signature;persist(next);res.writeHead(200).end('{}');
    }catch{res.writeHead(409).end('{"error":"Invalid or stale local delivery"}');}finally{unlock();}return;
  }
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(url.pathname==='/api/public'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({records:Object.values(store.records).map((r)=>({snapshot:r.snapshot,releasedAt:r.releasedAt,underReview:r.underReview,lastSynchronizedAt:r.lastSynchronizedAt})),current:store.current}));return;}
  if(url.pathname==='/about'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(renderAbout());return;}
  const stable=/^\/competition\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if(stable){const id=store.current[stable[1]+'/'+stable[2]];if(!id){res.writeHead(404).end('No released competition');return;}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(page(renderResults(store.records[id],store)));return;}
  const match=/^\/results\/([^/]+)(?:\/(entrant|judge)\/([^/]+))?$/.exec(url.pathname);
  if(match){const r=store.records[match[1]];if(!r){res.writeHead(404).end('Published revision unavailable');return;}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(page(renderResults(r,store,match[2]==='entrant'?match[3]:undefined,match[2]==='judge'?match[3]:undefined)));return;}
  if(url.pathname!=='/'&&url.pathname!=='/leaderboard'){res.writeHead(404).end('Not found');return;}
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end(renderIndex(store,url.pathname==='/leaderboard',url.searchParams.get('event') ?? ''));
}).listen(port,'127.0.0.1',()=>console.log(`Synthetic public receiver: http://127.0.0.1:${port}`));
