import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {schoolToday} from '../frontend/src/studentLifecycle.ts';

const read=name=>fs.readFileSync(new URL('../pb_hooks/'+name,import.meta.url),'utf8');
const billingContext={module:{exports:{}}};
vm.runInNewContext(read('billing-lib.js'),billingContext);
const billing=billingContext.module.exports;
const effectiveToday='2026-11-12';
function fixture(){
  let seq=0;
  const stored=[];
  const collection=name=>({name});
  class Record{
    constructor(c,id){this.type=c.name;this.id=id||'new'+(++seq);this.values={};}
    collection(){return collection(this.type)}
    getString(key){const value=this.values[key];return typeof value==='object'?JSON.stringify(value):String(value??'')}
    getFloat(key){return Number(this.values[key]||0)}
    getBool(key){return Boolean(this.values[key])}
    set(key,value){this.values[key]=value}
  }
  const app={
    findCollectionByNameOrId:collection,
    findRecordsByFilter(name,_filter,_sort,_limit,_offset,params){
      assert.equal(name,'schedule_history');
      return stored.filter(r=>r.getString('daycare')===params.daycare&&r.getString('entity')===params.entity&&r.getString('effective_date')===params.date);
    },
    save(row){if(row.type==='schedule_history'&&!stored.includes(row))stored.push(row);}
  };
  const ctx={module:{exports:{}},Record,__hooks:'hooks',require:path=>{
    assert.ok(path.endsWith('/billing-lib.js'));
    return {...billing,nyDate:()=>effectiveToday};
  }};
  vm.runInNewContext(read('schedule-lib.js'),ctx);
  const {capture}=ctx.module.exports;
  const student=new Record(collection('students'),'kid');
  for(const [k,v]of Object.entries({daycare:'bf',name:'Gia',classroom:'infant',size:'small',
    active:true,service_days:['Wednesday','Thursday'],billing_effective_date:''}))student.set(k,v);
  return {app,student,capture,stored};
}
function history(stored){
 return [{entity:'school',effective_date:'2026-11-01',snapshot:{count_mode:'roster',invoice_rate:4}},
   ...stored.map(row=>({entity:row.getString('entity'),effective_date:row.getString('effective_date'),snapshot:JSON.parse(row.getString('snapshot'))}))];
}
const school={public_slug:'lightbridge-bergenfield'};
test('new student with no explicit effective date appears in the same-day kitchen counts',()=>{
 const f=fixture();
 f.student.set('service_days',['Thursday']);
 f.capture(f.app,f.student,false);
 assert.equal(f.stored[0].getString('effective_date'),effectiveToday);
 assert.equal(billing.daily(school,history(f.stored),[],effectiveToday).quantity,1);
 assert.equal(billing.daily(school,history(f.stored),[],'2026-11-11').quantity,0);
});
test('same-day edits replace today without modifying yesterday or earlier snapshots',()=>{
 const f=fixture();
 f.student.set('billing_effective_date','2026-11-01');
 f.capture(f.app,f.student,false);
 assert.equal(billing.daily(school,history(f.stored),[],'2026-11-11').quantity,1);
 f.student.set('billing_effective_date','');
 f.student.set('service_days',['Wednesday']);
 f.capture(f.app,f.student,false);
 assert.equal(f.stored.length,2);
 assert.equal(billing.daily(school,history(f.stored),[],'2026-11-11').quantity,1);
 assert.equal(billing.daily(school,history(f.stored),[],effectiveToday).quantity,0);
});
test('explicit future schedule dates continue to work without overwriting the current day',()=>{
 const f=fixture();
 f.student.set('billing_effective_date',effectiveToday);
 f.capture(f.app,f.student,false);
 f.student.set('billing_effective_date','2026-11-19');
 f.student.set('service_days',['Wednesday']);
 f.capture(f.app,f.student,false);
 assert.equal(billing.daily(school,history(f.stored),[],effectiveToday).quantity,1);
 assert.equal(billing.daily(school,history(f.stored),[],'2026-11-19').quantity,0);
});
test('permanent student deletions take effect today, not tomorrow',()=>{
 const f=fixture();
 f.student.set('billing_effective_date','2026-11-01');
 f.capture(f.app,f.student,false);
 f.capture(f.app,f.student,true);
 assert.equal(f.stored.find(r=>r.getString('effective_date')===effectiveToday)?.getString('entity'),'kid');
 assert.equal(billing.daily(school,history(f.stored),[],effectiveToday).quantity,0);
 assert.equal(billing.daily(school,history(f.stored),[],'2026-11-11').quantity,1);
});
test('archiving a student with yesterday as inclusive last-lunch date removes today only',()=>{
 const before=history([{getString:key=>key==='entity'?'kid':key==='effective_date'?'2026-11-01':'{}'}]);
 const source=before.slice(0,1).concat([{entity:'kid',effective_date:'2026-11-01',
   snapshot:{name:'Gia',active:true,service_days:['Wednesday','Thursday']}}]);
 const updated=billing.withDepartures(source,[{id:'kid',last_lunch_date:'2026-11-11'}]);
 assert.equal(billing.daily(school,updated,[],'2026-11-11').quantity,1);
 assert.equal(billing.daily(school,updated,[],effectiveToday).quantity,0);
});
test('new student defaults are New York-local, including the midnight UTC boundary',()=>{
 assert.equal(schoolToday(new Date('2026-11-13T03:20:00Z')),'2026-11-12');
 const page=fs.readFileSync(new URL('../frontend/src/App.tsx',import.meta.url),'utf8');
 assert.match(page,/const \[effective, setEffective\] = useState\(\(\) => studentEffectiveDate\(\)\)/);
 assert.match(page,/setEffective\(studentEffectiveDate\(\)\)/);
 assert.match(page,/function archive\(s: Student\).*studentEffectiveDate\(-1\)/);
 assert.match(page,/setBulkLastDate\] = useState\(\(\) => studentEffectiveDate\(-1\)\)/);
 assert.doesNotMatch(page,/studentEffectiveDate\(true\)/);
 assert.match(read('student-lifecycle.js'),/body\.billing_effective_date\|\|lib\.nyDate\(\)/);
 assert.doesNotMatch(read('audit-lib.js'),/action==='delete'&&type==='students'\?require\(__hooks\+'\/billing-lib\.js'\)\.addDays/);
});
