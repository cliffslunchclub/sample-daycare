import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const context={module:{exports:{}}};vm.runInNewContext(readFileSync(new URL('../pb_hooks/audit-display.js',import.meta.url),'utf8'),context);const {decorate}=context.module.exports;
const rec=(id,fields)=>({id,getString:key=>String(fields[key]||'')});
test('new audit history saves readable relation names without changing raw before/after values',()=>{
 const records={daycares:rec('school',{name:'Bergenfield',sub_c_label:'Chicken and rice'}),students:rec('kid',{name:'RJ',daycare:'school'}),classrooms:rec('room',{name:'Preschool 2',daycare:'school'})};
 const app={findRecordById:(table)=>{if(!records[table])throw Error('missing');return records[table];}};
 const before={student:'kid',classroom:'room',daycare:'school',weekday:'Friday',code:'C',password:'Do not store'};
 const diff={student:{before:'kid',after:null},code:{before:'C',after:null}};
 decorate(app,'substitutions','school','Bergenfield',before,{},diff);
 assert.equal(diff.student.before,'kid');assert.equal(diff.student.before_label,'RJ');assert.equal(diff.code.before_label,'C — Chicken and rice');assert.equal(diff.__display.before.subject,'RJ');assert.equal(diff.__display.before.classroom,'Preschool 2');assert.equal(JSON.stringify(diff).includes('Do not store'),false);
});
test('audit name capture rejects related records from another school',()=>{
 const app={findRecordById:(table)=>{if(table==='students')return rec('kid',{name:'Private Student',daycare:'other'});throw Error('missing');}};
 const diff={student:{after:'kid'}};decorate(app,'substitutions','school','School',{}, {student:'kid'},diff);assert.equal(diff.student.after_label,undefined);assert.equal(diff.__display.after.subject,'');
});
