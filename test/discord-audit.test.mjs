import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function lib(extra={}){const context={module:{exports:{}},...extra};vm.runInNewContext(readFileSync(new URL('../pb_hooks/discord-audit-lib.js',import.meta.url),'utf8'),context);return context.module.exports;}
function row(data){return {id:data.id||'audit123',getString:key=>typeof data[key]==='object'?JSON.stringify(data[key]):String(data[key]??''),getBool:key=>Boolean(data[key]),getInt:key=>Number(data[key]||0),set:(k,v)=>{data[k]=v;}};}
const webhook='https://discord.com/api/webhooks/123456789012345678/fake_test_token_never_sent';
test('Discord destination permits only HTTPS Discord webhook paths',()=>{const l=lib();assert.equal(l.validWebhook(webhook),true);for(const bad of ['http://discord.com/api/webhooks/123/'+ 'x'.repeat(30),webhook+'?redirect=https://example.com','https://discord.com.evil.test/api/webhooks/123/'+ 'x'.repeat(30),'https://127.0.0.1/api/webhooks/123/'+ 'x'.repeat(30)])assert.equal(l.validWebhook(bad),false);});
test('Discord payload contains safe schedule changes without notes, health details, or mentions',()=>{
 const l=lib(),payload=l.payload(row({id:'event1',entity_type:'students',entity_label:'Nolan @everyone',school_name:'Bergenfield',actor_name:'Amanda',action:'update',occurred_at:'2026-10-07 21:00:00.000Z',effective_date:'2026-10-08',changes:{service_days:{before:['Monday','Wednesday','Friday'],after:['Monday','Friday']},note:{before:null,after:'Secret health detail'},password:{before:null,after:'Never send'}}}));
 const serialized=JSON.stringify(payload);assert.match(serialized,/10-08-2026/);assert.match(serialized,/Wednesday/);assert.equal(serialized.includes('Secret health detail'),false);assert.equal(serialized.includes('Never send'),false);assert.equal(serialized.includes('@everyone'),false);assert.equal(payload.allowed_mentions.parse.length,0);assert.equal(payload.embeds[0].timestamp,'2026-10-07T21:00:00.000Z');
});
test('Discord invoice messages omit private adjustment descriptions',()=>{const l=lib();const payload=l.payload(row({entity_type:'invoices',entity_label:'BF1026',actor_name:'Joe',action:'update',occurred_at:'2026-10-07T21:00:00Z',changes:{total_cents:{before:10000,after:12000},lines:{before:[],after:[{description:'private allergy detail'}]},notes:{before:'',after:'private note'}}}));assert.match(JSON.stringify(payload),/\$120.00/);assert.equal(JSON.stringify(payload).includes('private'),false);});
test('Discord worker retries rate limits, retains queued events, and records successful receipts',()=>{
 const state={id:'job1',audit_id:'event1',status:'pending',attempts:0,next_attempt:'2026-01-01 00:00:00Z'},job=row(state),config=row({enabled:true,webhook_url:webhook}),audit=row({id:'event1',entity_type:'menu_items',entity_label:'Rice',action:'create',occurred_at:'2026-10-07T21:00:00Z',changes:{name:{before:null,after:'Rice'}}});
 let response={statusCode:429,json:{retry_after:120}},calls=0;
 const l=lib({$http:{send:options=>{calls++;assert.equal(options.url.endsWith('?wait=true'),true);return response;}}});
 const app={findRecordsByFilter:collection=>collection==='discord_audit_settings'?[config]:[job],runInTransaction:fn=>fn(app),findRecordById:collection=>collection==='audit_logs'?audit:job,save:()=>{}};
 l.deliver(app);assert.equal(state.status,'pending');assert.equal(state.attempts,1);assert.match(state.last_error,/429/);assert.ok(Date.parse(state.next_attempt)>Date.now()+110000);
 state.next_attempt='2026-01-01 00:00:00Z';response={statusCode:200,json:{id:'discord-receipt'}};l.deliver(app);assert.equal(state.status,'sent');assert.equal(state.message_id,'discord-receipt');assert.equal(calls,2);
});
test('Discord does not enqueue old or disabled activity and disables revoked webhooks',()=>{
 const configState={enabled:false,webhook_url:webhook},config=row(configState);let saved=0;const app={findRecordsByFilter:c=>c==='discord_audit_settings'?[config]:[],save:()=>{saved++;}};lib().enqueue(app,row({}));assert.equal(saved,0);
 const state={id:'job',status:'pending',audit_id:'id',next_attempt:'2026-01-01T00:00:00Z'},job=row(state);configState.enabled=true;
 const revoked=lib({$http:{send:()=>({statusCode:404})}});Object.assign(app,{findRecordsByFilter:c=>c==='discord_audit_settings'?[config]:[job],findRecordById:c=>c==='audit_logs'?row({entity_type:'students',occurred_at:'2026-10-07T21:00:00Z',changes:{}}):job,runInTransaction:fn=>fn(app)});revoked.deliver(app);assert.equal(configState.enabled,false);assert.equal(state.status,'pending');assert.equal(state.last_error,'Discord returned HTTP 404');
});

test('Discord worker respects an active lease and does not send the same job concurrently',()=>{
 const config=row({enabled:true,webhook_url:webhook}),state={status:'processing',lease_until:'2099-01-01 00:00:00Z',attempts:1},job=row(state);let calls=0;
 const l=lib({$http:{send:()=>{calls++;return {statusCode:200};}}});
 const app={findRecordsByFilter:c=>c==='discord_audit_settings'?[config]:[job],findRecordById:()=>job,runInTransaction:fn=>fn(app),save:()=>{}};
 l.deliver(app);assert.equal(calls,0);assert.equal(state.attempts,1);
});

test('previously queued invoice activity is skipped without posting to Discord',()=>{
 const config=row({enabled:true,webhook_url:webhook}),state={status:'pending',next_attempt:'2026-01-01T00:00:00Z',audit_id:'old-invoice',attempts:0},job=row(state);let sends=0;
 const l=lib({$http:{send:()=>{sends++;return {statusCode:200};}}}),app={findRecordsByFilter:c=>c==='discord_audit_settings'?[config]:[job],findRecordById:c=>c==='audit_logs'?row({entity_type:'invoices'}):job,runInTransaction:fn=>fn(app),save:()=>{}};
 l.deliver(app);assert.equal(state.status,'skipped');assert.equal(sends,0);assert.equal(l.shouldNotify(row({entity_type:'invoice_flags'})),false);
});
