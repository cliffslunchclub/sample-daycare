import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const load=(name,require=()=>{})=>{const context={module:{exports:{}},__hooks:'hooks',require};vm.runInNewContext(fs.readFileSync(new URL('../pb_hooks/'+name,import.meta.url),'utf8'),context);return context.module.exports;};
const lib=load('billing-lib.js'),calc=load('invoice-adjustment-lib.js',()=>lib);
const school={public_slug:'lightbridge-bergenfield'},days=['Monday','Wednesday','Thursday','Friday'];
const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'roster',invoice_rate:4}},{entity:'k',effective_date:'2026-10-01',snapshot:{name:'Killian',active:true,service_days:days}}];
const reference=()=>calc.capture(school,h,[],'2026-10-01','2026-10-31');
const source=()=>({id:'oct',number:'BF1026',status:'closed',closed_snapshot:{reference:reference()}});
test('Killian added Tuesdays produce two October meals with exact dates',()=>{
 const changed=[...h,{entity:'k',effective_date:'2026-10-19',snapshot:{name:'Killian',active:true,service_days:[...days,'Tuesday']}}];
 const current=calc.capture(school,changed,[],'2026-10-01','2026-10-31'),rows=calc.pending(source(),current,{},[]);
 assert.equal(rows.length,1);assert.equal(rows[0].quantity,2);assert.equal(rows[0].amount_cents,800);assert.equal(JSON.stringify(rows[0].service_dates),'["2026-10-20","2026-10-27"]');
 const applied={id:'nov',lines:[{pending_source:'oct',pending_unit:rows[0].unit,quantity:2,pending_dates:rows[0].current_dates,pending_at:'2026-10-15T13:00:00Z'}]};
 assert.equal(calc.pending(source(),current,{},[applied]).length,0);
 const credits=calc.pending(source(),reference(),{},[applied]);assert.equal(credits[0].quantity,-2);assert.equal(JSON.stringify(credits[0].service_dates),'["2026-10-20","2026-10-27"]');
 assert.equal(calc.pending(source(),current,{},[])[0].quantity,2,'deleting the draft releases its reservation');
});
test('manual credits do not become schedule differences and rate corrections reconcile in cents',()=>{
 const src=source();src.lines=[{description:'RJ + Benny',quantity:-44,rate:4}];
 assert.equal(calc.pending(src,reference(),{},[]).length,0);
 const history=[...h,{entity:'school',effective_date:'2026-10-19',snapshot:{count_mode:'roster',invoice_rate:4.5}}];
 const rows=calc.pending(src,calc.capture(school,history,[],'2026-10-01','2026-10-31'),{},[]);
 assert.equal(rows.length,2);assert.equal(rows.reduce((n,r)=>n+r.amount_cents,0),400);
});
test('approved or removed historical one-offs are selectable charges or credits',()=>{
 const ref=reference(),request={id:'trial',kind:'lunch',student_label:'Trial Student',service_date:'2026-10-20',status:'approved'};
 const now=calc.requestUnits(ref,[request],school,h,[]),rows=calc.pending(source(),ref,now,[]);
 assert.equal(rows.length,1);assert.equal(rows[0].request_id,'trial');assert.equal(rows[0].quantity,1);
 const applied={id:'nov',lines:[{pending_source:'oct',pending_unit:rows[0].unit,quantity:1,pending_dates:rows[0].current_dates,pending_at:'2026-10-15T13:00:00Z'}]};
 assert.equal(calc.pending(source(),ref,now,[applied]).length,0);
 const removed=calc.requestUnits(ref,[{...request,status:'deleted'}],school,h,[]);
 assert.equal(calc.pending(source(),ref,removed,[applied])[0].quantity,-1);
});
test('closing checks saved schedule totals and rejects an untracked edited schedule',()=>{
 const invoice={shared:true,lines:[{baseline:true,quantity:18,rate:4}]};
 calc.validateClose(invoice,reference());
 assert.throws(()=>calc.validateClose({...invoice,shared:false},reference()),/Save/);
 assert.throws(()=>calc.validateClose({...invoice,lines:[{baseline:true,quantity:17,rate:4}]},reference()),/differ/);
 assert.throws(()=>calc.validateClose(invoice,null),/Recalculate/);
});
test('the supplied emailed reference reconciles its original roster and all four billed lines',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../pb_hooks/bf1026-reference.json',import.meta.url),'utf8'));
 assert.equal(source.roster.length,39);
 const counts=Object.fromEntries(['Monday','Tuesday','Wednesday','Thursday','Friday'].map(day=>[day,source.roster.filter(s=>s.active&&s.service_days.includes(day)).length]));
 assert.deepEqual(counts,{Monday:25,Tuesday:21,Wednesday:25,Thursday:23,Friday:38});
 const total=lib.totals(source.lines);assert.equal(total.subtotal_cents,217200);assert.equal(total.tax_cents,14390);assert.equal(total.total_cents,231590);
 assert.equal(source.lines[3].quantity,-44);assert.equal(source.lines[1].quantity,4);assert.equal(source.lines[2].quantity,-6);
 assert.match(source.sha256,/^[a-f0-9]{64}$/);
});

test('removing a later-added student keeps a credit pending after the addition was already billed',()=>{
 const source={id:'oct',number:'BF1026',closed_snapshot:{reference:{start:'2026-10-01',end:'2026-10-31',units:{}}}};
 const applied={id:'nov',status:'closed',lines:[{description:'Schedule correction for BF1026: New Student - 10-20-2026, 10-27-2026 (+2 meals)',pending_source:'oct',pending_unit:'student:new|400',quantity:2,rate:4,pending_dates:['2026-10-20','2026-10-27'],pending_at:'2026-10-15T13:00:00Z'}]};
 const pending=calc.pending(source,{units:{}},{},[applied]);assert.equal(pending.length,1);assert.equal(pending[0].quantity,-2);assert.equal(pending[0].label,'New Student');assert.equal(pending[0].amount_cents,-800);
});
