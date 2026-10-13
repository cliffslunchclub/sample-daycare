import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('../pb_hooks/substitution-edit.js',import.meta.url),'utf8');
const record=(fields)=>({id:fields.id,fields,getString(key){return String(this.fields[key]||'');},getBool(key){return Boolean(this.fields[key]);},set(key,value){this.fields[key]=value;}});
function fixture(){
  const school=record({id:'school',allow_substitutions:true});
  const student=record({id:'kid',daycare:'school'});
  const row=record({id:'sub',daycare:'school',student:'kid',recurring:true,weekday:'Friday',service_date:'2026-10-16',code:'C',pizza_substitution:true,note:'Preserved note'});
  let conflicts=[];const audit=[];
  const tx={findRecordById(name){return name==='substitutions'?row:name==='daycares'?school:student;},findRecordsByFilter(){return conflicts;}};
  const app={runInTransaction(fn){fn(tx);}};
  const module={exports:{}};
  runInNewContext(source,{module,ForbiddenError:Error,BadRequestError:Error,__hooks:'hooks',require:()=>({save:(app,row,actor)=>audit.push({fields:{...row.fields},actor})})});
  return {edit:module.exports.edit,app,row,school,audit,conflict:()=>{conflicts=[{}];}};
}
const actor=(role='daycare_admin',daycare='school',active=true)=>record({role,daycare,active});
test('recurring substitution edits preserve student/note, update weekday/code, and audit both admin roles',()=>{
  const f=fixture();f.edit(f.app,actor(),'sub',{service_date:'2026-10-12',code:'A',student:'other-student'});
  assert.equal(f.row.fields.student,'kid');assert.equal(f.row.fields.note,'Preserved note');assert.equal(f.row.fields.weekday,'Monday');assert.equal(f.row.fields.code,'A');assert.equal(f.row.fields.pizza_substitution,false);
  f.edit(f.app,actor('clc_admin'),'sub',{service_date:'2026-10-12',code:'V'});assert.equal(f.audit.length,2);
});
test('substitution edits reject unauthorized access, disabled schools and duplicate weekdays without changing records',()=>{
  for(const invalid of [null,actor('daycare_admin','other'),actor('parent'),actor('clc_admin','school',false)]){
    const f=fixture(),before={...f.row.fields};assert.throws(()=>f.edit(f.app,invalid,'sub',{service_date:'2026-10-12',code:'A'}));assert.deepEqual(f.row.fields,before);assert.equal(f.audit.length,0);
  }
  for(const kind of ['disabled','duplicate']){const f=fixture(),before={...f.row.fields};if(kind==='disabled')f.school.fields.allow_substitutions=false;else f.conflict();assert.throws(()=>f.edit(f.app,actor(),'sub',{service_date:'2026-10-12',code:'A'}));assert.deepEqual(f.row.fields,before);}
});
test('substitution edits reject weekends, impossible dates and unknown meal options',()=>{
  for(const body of [{service_date:'2026-10-17',code:'A'},{service_date:'2026-02-31',code:'A'},{service_date:'2026-10-12',code:'Z'}]){const f=fixture();assert.throws(()=>f.edit(f.app,actor(),'sub',body));assert.equal(f.audit.length,0);}
});
