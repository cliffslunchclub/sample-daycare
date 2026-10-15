import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../pb_hooks/'+name,import.meta.url),'utf8');
function load(name,extra={}){const c={module:{exports:{}},...extra};vm.runInNewContext(read(name),c);return c.module.exports;}
const audit=load('audit-lib.js'),billing=load('billing-lib.js'),state=load('audit-undo-state.js');
function fixture(){
 const values={name:'Killian',daycare:'school',classroom:'room',active:true,service_days:['Monday','Tuesday','Wednesday','Thursday','Friday'],size:'small',billing_effective_date:'2026-10-19',last_lunch_date:''};
 const record=(type,id,values)=>({id,values,collection:()=>({name:type}),getString:k=>typeof values[k]==='object'?JSON.stringify(values[k]):String(values[k]??''),getBool:k=>Boolean(values[k]),publicExport:()=>({...values})});
 const student=record('students','kid',values),school=record('daycares','school',{name:'School',sizes_enabled:true}),room=record('classrooms','room',{name:'Classroom',meal_size:'small',daycare:'school',active:true});
 const changes={service_days:{before:['Monday','Wednesday','Thursday','Friday'],after:values.service_days},billing_effective_date:{before:'2026-10-01',after:'2026-10-19'}};
 const source=record('audit_logs','event',{entity_type:'students',entity_id:'kid',daycare:'school',action:'update',occurred_at:'2026-10-15 12:00:00.000Z',effective_date:'2026-10-19',changes});
 const actor=record('users','admin',{role:'clc_admin',active:true});let later=[],writes=0;
 const app={findRecordById(type){return type==='audit_logs'?source:type==='students'?student:type==='classrooms'?room:school;},findRecordsByFilter(type){return type==='audit_logs'?later:[];},runInTransaction(fn){fn(app);},save(){writes++;}};
 const modules={'audit-lib.js':audit,'billing-lib.js':billing,'audit-undo-state.js':{same:state.same,capture:()=>null,validate(){}},'invoice-adjustments.js':{currentValues:()=>({})},'audit-display.js':{decorate(){}}};
 const lib=load('audit-undo-lib.js',{__hooks:'hooks',require:path=>modules[path.split('/').pop()]});
 return {lib,app,actor,student,source,changes,setLater(value){later=value;},record,writes:()=>writes};
}
test('legacy schedule undo restores prior days from the original change date',()=>{
 const f=fixture(),plan=f.lib.plan(f.app,f.actor,'event');assert.equal(plan.effective,'2026-10-19');assert.equal(plan.restore.billing_effective_date,'2026-10-19');assert.deepEqual(Array.from(plan.restore.service_days),['Monday','Wednesday','Thursday','Friday']);assert.equal(f.writes(),0);
});
test('already undone entries, permanent deletions, accounts and conflicting current fields are blocked',()=>{
 const f=fixture();f.changes.__undone={at:'today'};assert.throws(()=>f.lib.plan(f.app,f.actor,'event'),/already/);delete f.changes.__undone;
 f.source.values.entity_type='users';assert.throws(()=>f.lib.plan(f.app,f.actor,'event'),/not available/);f.source.values.entity_type='students';
 f.source.values.action='delete';assert.throws(()=>f.lib.plan(f.app,f.actor,'event'),/Permanent/);f.source.values.action='update';
 f.student.values.service_days=['Monday'];assert.throws(()=>f.lib.plan(f.app,f.actor,'event'),/no longer matches/);
});
test('newer active operations block undo, while undo receipts and undone operations do not',()=>{
 const f=fixture(),later=f.record('audit_logs','later',{changes:{name:{before:'A',after:'B'}}});f.setLater([later]);assert.throws(()=>f.lib.plan(f.app,f.actor,'event'),/newer/);
 later.values.changes.__undone={at:'today'};assert.doesNotThrow(()=>f.lib.plan(f.app,f.actor,'event'));
 later.values.changes={__undo:{source_id:'other'}};assert.doesNotThrow(()=>f.lib.plan(f.app,f.actor,'event'));
});
test('preview is read-only and stale confirmation tokens cause no writes',()=>{
 const f=fixture(),preview=f.lib.run(f.app,f.actor,{action:'preview',id:'event'});assert.ok(preview.token);assert.equal(f.writes(),0);
 assert.throws(()=>f.lib.run(f.app,f.actor,{action:'apply',id:'event',token:preview.token+'stale'}),/changed since/);assert.equal(f.writes(),0);
});
test('anonymous and school-admin undo endpoint requests are denied',()=>{
 let handler;vm.runInNewContext(read('audit_undo.pb.js'),{routerAdd:(_m,_p,h)=>{handler=h;}});
 for(const auth of [null,{getBool:()=>true,getString:()=> 'daycare_admin'},{getBool:()=>false,getString:()=> 'clc_admin'}]){let status;handler({auth,json:code=>{status=code;}});assert.equal(status,403);}
});
test('schedule state equality ignores object key ordering but retains values and version order',()=>{
 assert.equal(state.same({a:1,b:{x:2,y:3}},{b:{y:3,x:2},a:1}),true);assert.equal(state.same({a:[1,2]},{a:[2,1]}),false);
});
