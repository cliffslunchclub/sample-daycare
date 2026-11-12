import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledStudentsForDate} from '../frontend/src/datedRoster.ts';

test('a tomorrow-effective roster change leaves today and earlier weekdays unchanged in kitchen summary',()=>{
  const students=[
    {id:'keep',name:'Keep',daycare:'bf',classroom:'small',size:'small',active:true,service_days:['Friday']},
    {id:'removed',name:'Removed',daycare:'bf',classroom:'small',size:'small',active:true,last_lunch_date:'2026-11-12',service_days:[]},
    {id:'new',name:'New',daycare:'bf',classroom:'large',size:'large',active:true,service_days:['Friday']},
  ];
  const versions=[
    {entity:'keep',effective_date:'2026-10-01',snapshot:{name:'Keep',active:true,service_days:['Monday','Friday'],size:'small'}},
    {entity:'keep',effective_date:'2026-11-13',snapshot:{name:'Keep',active:true,service_days:['Friday'],size:'small'}},
    {entity:'removed',effective_date:'2026-10-01',snapshot:{name:'Removed',active:true,service_days:['Monday','Thursday','Friday'],size:'small'}},
    {entity:'removed',effective_date:'2026-11-13',snapshot:{name:'Removed',active:true,last_lunch_date:'2026-11-12',service_days:[],size:'small'}},
    {entity:'new',effective_date:'2026-11-13',snapshot:{name:'New',active:true,service_days:['Friday'],size:'large'}},
  ];
  assert.deepEqual(scheduledStudentsForDate(students,versions,'bf','Monday','2026-11-09').map(s=>s.id),['keep','removed']);
  assert.deepEqual(scheduledStudentsForDate(students,versions,'bf','Thursday','2026-11-12').map(s=>s.id),['removed']);
  assert.deepEqual(scheduledStudentsForDate(students,versions,'bf','Friday','2026-11-13').map(s=>s.id),['keep','new']);
});

test('no history falls back to current roster (old or local demo databases)',()=>{
 const student={id:'s',name:'Student',daycare:'bf',classroom:'room',size:'small',active:true,service_days:['Friday']};
 assert.deepEqual(scheduledStudentsForDate([student],[],'bf','Friday','2026-11-13').map(x=>x.id),['s']);
});
