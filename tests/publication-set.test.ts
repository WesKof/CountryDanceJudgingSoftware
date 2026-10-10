import test from 'node:test';
import assert from 'node:assert/strict';
import {latestPublications,type PublicationRecord} from '../lib/live/publication.ts';
test('event review selects the newest preparation per competition, including changed unreleased versions',()=>{
 const item=(id:string,competitionId:string,revision:number,preparedAt:string,status:PublicationRecord['status'])=>({id,competitionId,revision,status,snapshot:{preparedAt}} as PublicationRecord);
 const old=item('old','strictly',1,'2026-10-01','released'),changed=item('changed','strictly',2,'2026-10-02','stale'),renewed=item('renewed','strictly',2,'2026-10-03','prepared'),jj=item('jj','jj',1,'2026-10-01','requested');
 assert.deepEqual(latestPublications([old,jj,changed]).map((p)=>p.id),['changed','jj']);
 assert.deepEqual(latestPublications([renewed,jj,changed,old]).map((p)=>p.id),['renewed','jj']);
 assert.deepEqual(latestPublications([changed,renewed,old,jj]).map((p)=>p.id),['renewed','jj']);
 assert.deepEqual(latestPublications([]),[]);
});
