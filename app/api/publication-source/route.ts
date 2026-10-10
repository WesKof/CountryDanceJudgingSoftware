import {env} from 'cloudflare:workers';
import {getDb} from '@/db';
import {attestPublication} from '@/lib/live/server';
import {localPublisher} from '@/lib/live/local-publisher';
import {record} from '@/lib/live/validation';
export const dynamic='force-dynamic';
export async function POST(request:Request){const headers={'Cache-Control':'no-store, private'};try{const raw=await request.text();if(raw.length>10000)return Response.json({valid:false},{status:413,headers});localPublisher(request,false);const values=env as Record<string,unknown>;if(!values.LOCAL_RECEIVER_KEY||request.headers.get('authorization')!==`Bearer ${values.LOCAL_RECEIVER_KEY}`)return Response.json({valid:false},{status:403,headers});return Response.json(await attestPublication(getDb(),record(JSON.parse(raw))),{headers});}catch{return Response.json({valid:false},{status:503,headers});}}
