import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file=new URL('../pb_migrations/1794480000_bergenfield_roster_nov13_2026.js',import.meta.url);
const migration=fs.readFileSync(file,'utf8');
const match=migration.match(/^const roster=(\{.*\});$/m);
assert.ok(match,'The source-of-truth roster is embedded as JSON in the migration');
const roster=JSON.parse(match[1]);
const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];

test('Bergenfield PDF named rows are counted once, ignoring (2)/(3) and inconsistent subtotals',()=>{
  const expected={Monday:23,Tuesday:23,Wednesday:25,Thursday:24,Friday:36};
  assert.deepEqual(Object.fromEntries(days.map((day,index)=>[day,Object.values(roster).reduce((n,entries)=>n+entries[index].length,0)])),expected);
  assert.deepEqual(Object.keys(roster),['Mobile Infants','Purple Cats','Khaki Kangaroo','Yellow Ducks','Blue Horses','Green Frogs','Goldfish','Brown Bears']);
  assert.ok(Object.values(roster).every(entries=>entries.length===5&&entries.every(a=>a.every(name=>!/\([23]\)/.test(name)))));
  assert.ok(roster['Green Frogs'].every(d=>d.length===0));
  assert.equal(roster.Goldfish[4].length,9,'Nine Goldfish names in the file override the printed Friday subtotal of eight');
  assert.equal(roster['Yellow Ducks'][0].length,3,'Do not invent two weekday Yellow Ducks to satisfy printed totals');
  assert.ok(roster['Yellow Ducks'][0].includes('Leo (veg)'),'Dietary labels other than portion markers are preserved');
});

test('dated migration retains old snapshots and student IDs, moves students and ends removed schedules on Nov 12',()=>{
  let next=0;
  const record=(id,data)=>({
    id,data:{...data},
    getString(k){const v=this.data[k];return typeof v==='object'?JSON.stringify(v):String(v??'');},
    getBool(k){return Boolean(this.data[k]);},
    set(k,v){this.data[k]=v;},
  });
  const school=record('bf',{public_slug:'lightbridge-bergenfield',count_mode:'roster'});
  const rooms=Object.keys(roster).map((name,index)=>record('room'+index,{name:name==='Mobile Infants'?'Mobiles Infants':name,active:true}));
  const rid=name=>rooms[Object.keys(roster).indexOf(name)].id;
  const students=[
    record('nolan',{name:'Nolan',daycare:'bf',classroom:rid('Purple Cats'),active:true,service_days:['Monday','Wednesday','Friday']}),
    record('ade',{name:'Ade',daycare:'bf',classroom:rid('Green Frogs'),active:true,service_days:days}),
    record('oliver',{name:'Oliver',daycare:'bf',classroom:rid('Green Frogs'),active:true,service_days:days}),
    record('margo',{name:'Margo',daycare:'bf',classroom:rid('Purple Cats'),active:true,service_days:days}),
    record('eddie',{name:'Eddie',daycare:'bf',classroom:rid('Yellow Ducks'),active:true,service_days:days}),
    record('viv',{name:'Viv',daycare:'bf',classroom:rid('Khaki Kangaroo'),active:true,service_days:days}),
    record('leo',{name:'Leo Stern (veg)',daycare:'bf',classroom:rid('Yellow Ducks'),active:true,service_days:days}),
  ];
  const prior=students.map(s=>({id:s.id,effective_date:'2026-11-01',snapshot:{name:s.data.name,active:s.data.active,service_days:[...s.data.service_days],classroom:s.data.classroom}}));
  const history=[...prior];
  const app={
    findRecordsByFilter(table){if(table==='daycares')return [school];if(table==='classrooms')return rooms;if(table==='students')return [...students];throw Error('bad collection')},
    findCollectionByNameOrId(name){return {name}},
    save(){},
  };
  const audit={save(_app,row){if(!students.includes(row))students.push(row);history.push({id:row.id,effective_date:row.getString('billing_effective_date'),snapshot:{name:row.getString('name'),active:row.getBool('active'),service_days:JSON.parse(row.getString('service_days')||'[]'),classroom:row.getString('classroom'),last_lunch_date:row.getString('last_lunch_date')}});}};
  let up;
  class Record{constructor(){return record('new'+(++next),{})}}
  vm.runInNewContext(migration,{migrate(fn){up=fn},Record,__hooks:'hooks',require(){return audit;}});
  up(app);
  assert.equal(students.find(s=>s.id==='ade').data.classroom,rid('Goldfish'));
  assert.equal(students.find(s=>s.id==='oliver').data.classroom,rid('Goldfish'));
  assert.equal(students.find(s=>s.id==='margo').data.classroom,rid('Goldfish'));
  assert.equal(students.find(s=>s.id==='nolan').data.service_days.join(','),'Friday');
  assert.equal(students.find(s=>s.id==='eddie').data.last_lunch_date,'2026-11-12');
  assert.deepEqual(students.find(s=>s.id==='eddie').data.service_days,[]);
  assert.equal(students.find(s=>s.id==='viv').data.name,'Vivi');
  assert.equal(students.find(s=>s.id==='leo').data.name,'Leo Stern (veg)');
  assert.equal(rooms[0].data.name,'Mobile Infants');
  assert.ok(history.filter(h=>h.effective_date!=='2026-11-01').every(h=>h.effective_date==='2026-11-13'));
  assert.deepEqual(history.filter(h=>h.effective_date==='2026-11-01'),prior,'Earlier records are not rewritten by the dated roster change');
  const current=students.filter(s=>s.data.active&&s.data.service_days.length&&(!s.data.last_lunch_date||s.data.last_lunch_date>='2026-11-13'));
  assert.deepEqual(days.map(day=>current.filter(s=>s.data.service_days.includes(day)).length),[23,23,25,24,36]);
});

const load=(name,req=()=>{})=>{
  const context={module:{exports:{}},__hooks:'hooks',require:req};
  vm.runInNewContext(fs.readFileSync(new URL('../pb_hooks/'+name,import.meta.url),'utf8'),context);
  return context.module.exports;
};
const lib=load('billing-lib.js');
const calc=load('invoice-adjustment-lib.js',()=>lib);
const changes=load('invoice-adjustments.js',name=>name.endsWith('/billing-lib.js')?lib:calc);

test('issued November invoice stays frozen; Nov 13+ roster difference becomes a December adjustment',()=>{
  const school={public_slug:'lightbridge-bergenfield'};
  const before=[
    {entity:'school',effective_date:'2026-11-01',snapshot:{count_mode:'roster',invoice_rate:4}},
    {entity:'student1',effective_date:'2026-11-01',snapshot:{name:'Student One',active:true,service_days:['Friday']}},
  ];
  const ref=calc.capture(school,before,[],'2026-11-01','2026-11-30');
  const issued={id:'nov',number:'BF1126',status:'issued',billing_snapshot:ref,lines:[]};
  const after=[...before,{entity:'student1',effective_date:'2026-11-13',snapshot:{name:'Student One',active:true,service_days:[]}}];
  const source=changes.correctionSource(issued,[]);
  const current=calc.capture(school,after,[],'2026-11-01','2026-11-30');
  const pending=calc.pending(source.source,current,{},[issued]);
  assert.equal(pending.length,1);
  assert.equal(pending[0].quantity,-3);
  assert.equal(pending[0].amount_cents,-1200);
  assert.equal(JSON.stringify(pending[0].service_dates),'["2026-11-13","2026-11-20","2026-11-27"]');
  const applied={id:'dec',status:'draft',lines:[{pending_source:'nov',pending_unit:pending[0].unit,quantity:-3,rate:4,pending_dates:pending[0].current_dates,pending_at:'2026-12-01T12:00:00Z'}]};
  assert.equal(calc.pending(source.source,current,{},[issued,applied]).length,0,'Applied corrections must not recur');
  const closed={...issued,status:'closed',closed_snapshot:{reference:source.reference}};
  assert.equal(calc.pending(changes.correctionSource(closed,[]).source,current,{},[closed,applied]).length,0,'Closing must not duplicate an already-applied correction');
});

test('issued invoice one-off lunches already billed are included in its original reference',()=>{
  const school={public_slug:'lightbridge-bergenfield'};
  const history=[{entity:'school',effective_date:'2026-11-01',snapshot:{count_mode:'roster',invoice_rate:4}}];
  const ref=calc.capture(school,history,[],'2026-11-01','2026-11-30');
  const request={id:'r1',student_label:'Trial',kind:'lunch',status:'approved',service_date:'2026-11-12'};
  const issued={id:'nov',number:'BF1126',status:'issued',billing_snapshot:ref,lines:[{request_id:'r1',quantity:1,rate:4}]};
  const correction=changes.correctionSource(issued,[request]);
  const current=calc.capture(school,history,[],'2026-11-01','2026-11-30');
  assert.equal(calc.pending(correction.source,current,calc.requestUnits(correction.reference,[request],school,history,[]),[issued]).length,0);
});
