// Optional local dispatcher; owner-approved deliveries/status notices only. No approval creation.
const key=process.env.LOCAL_OWNER_KEY,base=process.env.LOCAL_OPERATIONAL_URL ?? 'http://127.0.0.1:3000';
if(!key||!base.startsWith('http://127.0.0.1:'))throw new Error('Use isolated local owner credentials and loopback origin.');
let running=false;
setInterval(async()=>{if(running)return;running=true;try{await fetch(base+'/api/publication-owner',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action:'retry'}),signal:AbortSignal.timeout(10000)});}catch{/* Durable requests stay pending while either local service is down. */}finally{running=false;}},2500);
console.log('Local outbox dispatcher running; no new approvals are created.');
