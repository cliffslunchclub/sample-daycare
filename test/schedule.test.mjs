import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const record=(data)=>({data:{...data},getString(k){return typeof this.data[k]==='object'?JSON.stringify(this.data[k]):String(this.data[k]??'');},set(k,v){this.data[k]=v;}});
test('approved date migration shifts only additions and removals, preserving October 8 overrides',()=>{
 const row=(entity,date,active,days=['Friday'])=>record({daycare:'school',entity,effective_date:date,snapshot:{active,service_days:days}});
 const rows=[row('added','2026-10-07',true),row('removed','2026-10-01',true),row('removed','2026-10-07',false),row('weekday-edit','2026-10-01',true),row('weekday-edit','2026-10-07',true,['Monday']),row('override','2026-10-07',true),row('override','2026-10-08',false)];
 let run;vm.runInNewContext(readFileSync(new URL('../pb_migrations/1791392400_next_day_student_changes.js',import.meta.url),'utf8'),{migrate:(up)=>{run=up;}});
 const app={findRecordsByFilter(_collection,filter,sort,_limit,_offset,params){let found=rows.filter(r=>r.data.entity!=='school');if(params.school)found=found.filter(r=>r.data.daycare===params.school&&r.data.entity===params.entity);found=found.filter(r=>filter.includes('effective_date <')?r.data.effective_date<params.date:r.data.effective_date===params.date);if(sort)found.sort((a,b)=>b.data.effective_date.localeCompare(a.data.effective_date));return params.school?found.slice(0,1):found;},findRecordById(){throw Error('Deleted or missing student');},save(){},delete(row){rows.splice(rows.indexOf(row),1);}};
 run(app);
 assert.equal(rows.find(r=>r.data.entity==='added').data.effective_date,'2026-10-08');
 assert.equal(rows.find(r=>r.data.entity==='removed'&&!r.data.snapshot.active).data.effective_date,'2026-10-08');
 assert.equal(rows.find(r=>r.data.entity==='weekday-edit'&&r.data.effective_date==='2026-10-07').data.snapshot.service_days[0],'Monday');
 assert.equal(rows.filter(r=>r.data.entity==='override').length,1);
 assert.equal(rows.find(r=>r.data.entity==='override').data.snapshot.active,false);
});
