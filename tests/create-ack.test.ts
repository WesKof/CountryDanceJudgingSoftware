import test from 'node:test';
import assert from 'node:assert/strict';
import {createdEventPath} from '../lib/live/create-ack.ts';

const path='/live/'+'a1'.repeat(32);
test('fresh create acknowledgement accepts exactly the canonical private path',()=>{
  assert.equal(createdEventPath({path}),path);
  assert.equal(createdEventPath({path,unrelated:true}),path);
});
test('malformed or external fresh paths never become navigation or binding targets',()=>{
  const inputs:unknown[]=[undefined,null,false,0,'',[],[path],{}, {path:null},{path:0},{path:{}},{path:['x']},...['','/live/short','/live/'+'A'.repeat(64),'/live/'+'a'.repeat(63),'/live/'+'a'.repeat(65),'https://example.invalid'+path,'//example.invalid'+path,'javascript:alert(1)','data:text/html,test',path+'?x=1',path+'#x',' '+path,path+' ',path+'\n',path+'\r',path+'\u2028',path+'/',path.replace('/live/','/live//'),path.replace('/live/','/live/%61')].map(path=>({path}))];
  for(const input of inputs)assert.throws(()=>createdEventPath(input),{message:'The new event link could not be verified. Retry to recover the same event.'});
});
