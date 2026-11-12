import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const original=fs.readFileSync(new URL('../pb_migrations/1794480000_bergenfield_roster_nov13_2026.js',import.meta.url),'utf8');
const corrective=fs.readFileSync(new URL('../pb_migrations/1794495600_bergenfield_effective_nov12_2026.js',import.meta.url),'utf8');
const roster=JSON.parse(original.match(/^const roster=(\{.*\});$/m)[1]);
const oldDate='2026-11-13',newDate='2026-11-12';
const names=['Monday','Tuesday','Wednesday','Thursday','Friday'];

function runMigration(source,app,Record){
  let upgrade;
  vm.runInNewContext(source,{migrate(fn){upgrade=fn},Record});
  upgrade(app);
}
function fixture(hookWritesToday=false){
  let created=0;
  const row=(id,data)=>({
    id,data:{...data},
    getString(k){const v=this.data[k];return typeof v==='object'?JSON.stringify(v):String(v??'');},
    getBool(k){return Boolean(this.data[k]);},
    set(k,v){this.data[k]=v;},
  });
  class Record{constructor(){return row('new'+(++created),{});}}
  const school=row('bf',{public_slug:'lightbridge-bergenfield',count_mode:'roster'});
  const rooms=Object.keys(roster).map((name,i)=>row('r'+i,{name,active:true}));
  const room=name=>rooms[Object.keys(roster).indexOf(name)].id;
  const students=[
    row('eddie',{name:'Eddie (2)',daycare:'bf',active:true,classroom:room('Yellow Ducks'),service_days:names,size:'small'}),
    row('nolan',{name:'Nolan',daycare:'bf',active:true,classroom:room('Purple Cats'),service_days:names,size:'small'}),
    row('viv',{name:'Viv',daycare:'bf',active:true,classroom:room('Khaki Kangaroo'),service_days:names,size:'small'}),
  ];
  const originalSnapshots=students.map(s=>row('before-'+s.id,{
    daycare:'bf',entity:s.id,effective_date:'2026-11-01',
    snapshot:{name:s.data.name,classroom:s.data.classroom,service_days:[...s.data.service_days],active:true,size:s.data.size}
  }));
  const other=row('unrelated',{daycare:'other',entity:'unrelated-student',effective_date:oldDate,snapshot:{active:true}});
  const versions=[...originalSnapshots,other];
  const app={
    findRecordsByFilter(table,_filter,_sort,_limit,_offset,params){
      if(table==='daycares')return [school];
      if(table==='classrooms')return rooms;
      if(table==='students')return [...students];
      if(table==='schedule_history')return versions.filter(v=>v.data.daycare===params.school&&
        (!params.entity||v.data.entity===params.entity)&&
        (!params.date||v.data.effective_date===params.date));
      throw Error('Unexpected table '+table);
    },
    findCollectionByNameOrId(name){return {name};},
    save(value){
      if(value.data.entity&&value.data.snapshot){if(!versions.includes(value))versions.push(value);return;}
      if(value.data.daycare==='bf'&&value.data.name&&!students.includes(value))students.push(value);
      if(hookWritesToday&&value.data.billing_effective_date===newDate&&value.data.service_days){
        let version=versions.find(v=>v.data.daycare==='bf'&&v.data.entity===value.id&&v.data.effective_date===newDate);
        if(!version){version=new Record();versions.push(version);}
        version.data={daycare:'bf',entity:value.id,effective_date:newDate,snapshot:{
          name:value.data.name,classroom:value.data.classroom,service_days:value.data.service_days,
          active:value.data.active,last_lunch_date:value.data.last_lunch_date||'',size:value.data.size||''
        }};
      }
    },
    delete(value){const index=versions.indexOf(value);if(index<0)throw Error('Missing version');versions.splice(index,1);},
  };
  return {app,Record,students,versions,originalSnapshots,other};
}

for(const hookWritesToday of [false,true]){
  test('Bergenfield effective date shifts to Nov 12 with '+(hookWritesToday?'hook-written':'explicitly moved')+' history',()=>{
    const {app,Record,students,versions,originalSnapshots,other}=fixture(hookWritesToday);
    runMigration(original,app,Record);
    const eddie=students.find(s=>s.id==='eddie'),nolan=students.find(s=>s.id==='nolan');
    assert.equal(eddie.getString('last_lunch_date'),newDate);
    assert.ok(versions.some(v=>v.data.daycare==='bf'&&v.data.effective_date===oldDate));
    runMigration(corrective,app,Record);
    assert.equal(eddie.getString('last_lunch_date'),'2026-11-11');
    assert.equal(eddie.getString('billing_effective_date'),newDate);
    assert.deepEqual(Array.from(JSON.parse(eddie.getString('service_days'))),[]);
    assert.equal(nolan.getString('billing_effective_date'),newDate);
    assert.equal(nolan.getString('service_days'),'["Friday"]');
    assert.equal(versions.filter(v=>v.data.daycare==='bf'&&v.data.effective_date===oldDate).length,0);
    const shifted=versions.filter(v=>v.data.daycare==='bf'&&v.data.effective_date===newDate);
    assert.ok(shifted.length>=3,'New roster date must be stored in schedule history');
    assert.equal(new Set(shifted.map(v=>v.data.entity)).size,shifted.length,'One version per student/date');
    const eddieSnapshot=shifted.find(v=>v.data.entity==='eddie').data.snapshot;
    assert.equal(eddieSnapshot.last_lunch_date,'2026-11-11');
    assert.deepEqual(originalSnapshots.map(v=>v.data.effective_date),['2026-11-01','2026-11-01','2026-11-01']);
    assert.ok(versions.includes(other),'Unrelated school keeps its November 13 planned change');
    const count=versions.length;
    runMigration(corrective,app,Record);
    assert.equal(versions.length,count,'Correction is safe to repeat');
  });
}

test('a student removed from the roster is counted through Nov 11 but not Nov 12',()=>{
  const {app,Record,students,versions}=fixture();
  runMigration(original,app,Record);
  runMigration(corrective,app,Record);
  const lib={latest:(entity,date)=>versions
    .filter(v=>v.data.entity===entity&&v.data.effective_date<=date)
    .sort((a,b)=>b.data.effective_date.localeCompare(a.data.effective_date))[0]?.data.snapshot};
  const eddie=students.find(s=>s.id==='eddie');
  const attends=date=>{
    const value=lib.latest(eddie.id,date);
    const weekday=new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'});
    return Boolean(value?.active&&value.service_days.includes(weekday)&&(!eddie.data.last_lunch_date||date<=eddie.data.last_lunch_date));
  };
  assert.equal(attends('2026-11-11'),true);
  assert.equal(attends('2026-11-12'),false);
  assert.equal(attends('2026-11-13'),false);
});
