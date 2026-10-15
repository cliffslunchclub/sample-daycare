import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function lib(extra={}){const context={module:{exports:{}},...extra};vm.runInNewContext(readFileSync(new URL('../pb_hooks/discord-audit-lib.js',import.meta.url),'utf8'),context);return context.module.exports;}
function row(data){return {id:data.id||'audit123',getString:key=>typeof data[key]==='object'?JSON.stringify(data[key]):String(data[key]??''),getBool:key=>Boolean(data[key]),getInt:key=>Number(data[key]||0),set:(k,v)=>{data[k]=v;}};}
const webhook='https://discord.com/api/webhooks/123456789012345678/fake_test_token_never_sent';
const noon=new Date('2026-10-15T16:00:00Z');
function fixture(count=3){
 const configData={id:'config',enabled:true,webhook_url:webhook},config=row(configData),states=[],audits=new Map();let response={statusCode:200,json:{id:'summary-receipt'}},duringSend;
 for(let i=0;i<count;i++){states.push({id:'job'+i,audit_id:'event'+i,status:'pending',attempts:0,next_attempt:'2026-01-01T00:00:00Z'});audits.set('event'+i,row({id:'event'+i,school_name:i<2?'Bergenfield':'Fort Lee',entity_type:'students',entity_label:'Secret Student',actor_name:'Secret Admin',changes:{note:{after:'Sensitive note'}}}));}
 const jobs=states.map(row),calls=[];
 const l=lib({$http:{send:options=>{calls.push(options);if(duringSend)duringSend();return response;}}});
 const app={findRecordsByFilter:(type,filter,_sort,_limit,_offset,params)=>{if(type==='discord_audit_settings')return [config];if(filter.includes('lease_until >'))return jobs.filter((_,i)=>states[i].status==='processing'&&Date.parse(states[i].lease_until)>Date.parse(params.now));return jobs.filter((_,i)=>states[i].status==='pending'&&Date.parse(states[i].next_attempt)<=Date.parse(params.now)||states[i].status==='processing'&&Date.parse(states[i].lease_until)<=Date.parse(params.now));},findRecordById:(type,id)=>{if(type==='discord_audit_settings')return config;if(type==='audit_logs'){if(!audits.has(id))throw Error('Deleted');return audits.get(id);}return jobs.find(x=>x.id===id);},runInTransaction:fn=>fn(app),save:()=>{}};
 return {l,app,states,jobs,audits,calls,configData,response:r=>{response=r;},duringSend:fn=>{duringSend=fn;}};
}
test('Discord destination permits only HTTPS Discord webhook paths',()=>{const l=lib();assert.equal(l.validWebhook(webhook),true);for(const bad of ['http://discord.com/api/webhooks/123/'+ 'x'.repeat(30),webhook+'?redirect=https://example.com','https://discord.com.evil.test/api/webhooks/123/'+ 'x'.repeat(30),'https://127.0.0.1/api/webhooks/123/'+ 'x'.repeat(30)])assert.equal(l.validWebhook(bad),false);});
test('hourly summary includes only total and school counts, without identities, details or links',()=>{
 const f=fixture(),payload=f.l.payload([...f.audits.values()]),serialized=JSON.stringify(payload);assert.match(serialized,/3 changes/);assert.match(serialized,/Bergenfield: 2/);assert.match(serialized,/Fort Lee: 1/);
 for(const secret of ['Secret Student','Secret Admin','Sensitive note','Audit Log','http','event0','Changed by'])assert.equal(serialized.includes(secret),false);
 assert.equal(payload.allowed_mentions.parse.length,0);
 assert.equal(JSON.stringify(f.l.payload([row({school_name:'@everyone <School>'})])).includes('@everyone'),false);
});
test('the worker sends one message for the entire pending queue and stores one receipt for all jobs',()=>{
 const f=fixture(12);f.l.deliver(f.app,noon);assert.equal(f.calls.length,1);assert.match(f.calls[0].body,/12 changes/);assert.equal(f.calls[0].url.endsWith('?wait=true'),true);
 assert.ok(f.states.every(s=>s.status==='sent'&&s.message_id==='summary-receipt'&&s.attempts===1));assert.equal(f.configData.last_batch_hour,'2026-10-15T16');
});
test('empty queues and non-hourly times send no message; Eastern DST changes keep the :00 boundary',()=>{
 const empty=fixture(0);empty.l.deliver(empty.app,noon);assert.equal(empty.calls.length,0);
 for(const time of ['2026-10-15T16:30:00Z','2026-10-15T16:59:59Z']){const f=fixture();f.l.deliver(f.app,new Date(time));assert.equal(f.calls.length,0);assert.equal(f.states[0].status,'pending');}
 for(const time of ['2026-11-01T05:00:00Z','2026-11-01T06:00:00Z']){const f=fixture();f.l.deliver(f.app,new Date(time));assert.equal(f.calls.length,1);}
});
test('hour lease prevents concurrent and repeated sends, including new activity arriving after the batch',()=>{
 const f=fixture();f.duringSend(()=>f.l.deliver(f.app,noon));f.l.deliver(f.app,noon);assert.equal(f.calls.length,1);
 f.states[0].status='pending';f.states[0].next_attempt=noon.toISOString();f.l.deliver(f.app,noon);assert.equal(f.calls.length,1);
 f.l.deliver(f.app,new Date('2026-10-15T17:00:00Z'));assert.equal(f.calls.length,2);
});
test('rate limits and connection failures retain the whole batch for a later hourly retry',()=>{
 for(const response of [{statusCode:429,json:{retry_after:120}},{statusCode:0},{statusCode:500}]){
  const f=fixture();f.response(response);f.l.deliver(f.app,noon);assert.ok(f.states.every(s=>s.status==='pending'&&s.next_attempt==='2026-10-15T17:00:00.000Z'));
  f.l.deliver(f.app,noon);assert.equal(f.calls.length,1);f.response({statusCode:200,json:{id:'retry-success'}});f.l.deliver(f.app,new Date('2026-10-15T17:00:00Z'));assert.ok(f.states.every(s=>s.status==='sent'&&s.message_id==='retry-success'));assert.equal(f.configData.last_error,'');
 }
 const f=fixture();f.response({statusCode:429,json:{retry_after:7201}});f.l.deliver(f.app,noon);assert.equal(f.states[0].next_attempt,'2026-10-15T19:00:00.000Z');
});
test('disabled notifications do not queue or send, and revoked webhooks keep pending jobs while disabling delivery',()=>{
 const f=fixture();f.configData.enabled=false;let saves=0;f.app.save=()=>{saves++;};f.l.enqueue(f.app,row({}));f.l.deliver(f.app,noon);assert.equal(saves,0);assert.equal(f.calls.length,0);
 f.configData.enabled=true;f.response({statusCode:404});f.l.deliver(f.app,noon);assert.equal(f.configData.enabled,false);assert.ok(f.states.every(s=>s.status==='pending'&&s.last_error==='Discord returned HTTP 404'));
});
test('active delivery leases are respected, while expired jobs are recovered on the next hourly run',()=>{
 const f=fixture();f.states[0].status='processing';f.states[0].lease_until='2026-10-15T16:02:00Z';f.l.deliver(f.app,noon);assert.equal(f.calls.length,0);
 f.l.deliver(f.app,new Date('2026-10-15T17:00:00Z'));assert.equal(f.calls.length,1);assert.ok(f.states.every(s=>s.status==='sent'));
});
test('deleted audit records and queued invoice changes are skipped without including them in a summary',()=>{
 const f=fixture();f.audits.delete('event0');f.audits.set('event1',row({entity_type:'invoices'}));f.audits.set('event2',row({entity_type:'invoice_flags'}));f.l.deliver(f.app,noon);assert.equal(f.calls.length,0);assert.ok(f.states.every(s=>s.status==='skipped'));
 assert.equal(f.l.shouldNotify(row({entity_type:'invoice_flags'})),false);
});
test('Discord cron runs only on the hour and the settings describe summary delivery',()=>{
 let schedule;vm.runInNewContext(readFileSync(new URL('../pb_hooks/discord-audit.pb.js',import.meta.url),'utf8'),{routerAdd(){},cronAdd:(_name,cron)=>{schedule=cron;}});assert.equal(schedule,'0 * * * *');
 const ui=readFileSync(new URL('../frontend/src/DiscordAuditSettings.tsx',import.meta.url),'utf8');assert.match(ui,/:00 Eastern/);assert.match(ui,/only when activity is pending/);assert.ok(!ui.includes('every minute'));
});
