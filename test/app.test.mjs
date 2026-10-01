import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {counts,projection,mealsOn} from '../domain.mjs';

test('pizza rounds up and substitutions never become pizzas',()=>{
  const meals=Array.from({length:35},()=>({code:'standard',billing:'school'})).concat(Array.from({length:3},()=>({code:'A',billing:'school'})));
  assert.equal(counts(meals).total,38);assert.equal(counts(meals).pizzas,12);
  assert.equal(counts([]).pizzas,0);assert.equal(counts([{code:'standard'}]).pizzas,1);
});
test('effective schedules, dated meals, subsidy and billing adjustments stay distinct',()=>{
  const location={id:'l',rateCents:400,sizes:true};
  const s={id:'s',name:'Demo',locationId:'l',exceptions:[],versions:[{effective:'2026-10-01',active:true,days:['standard','standard','standard','standard','standard'],size:'Small',billing:'school'},{effective:'2026-10-15',active:true,days:['V','V','V','V','V'],size:'Large',billing:'subsidized'}]};
  const p=projection([s],location,'2026-10',[],[{locationId:'l',month:'2026-10',units:2,note:'Extra meals'}]);
  assert.equal(p.scheduled,10);assert.equal(p.billable,12);assert.equal(p.subtotalCents,4800);
  assert.equal(mealsOn([s],location,'2026-10-16')[0].size,'Large');
  assert.equal(mealsOn([s],location,'2026-10-16')[0].billing,'subsidized');
  assert.equal(mealsOn([s],location,'2026-10-16',[{locationId:'l',date:'2026-10-16'}]).length,0);
  s.exceptions.push({date:'2026-10-02',code:'B'});assert.equal(mealsOn([s],location,'2026-10-02')[0].code,'B');
});
test('server authorization, invoice snapshots, note review, and persistence',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'clc-test-'));
  const app=createApp({dataDir:dir,demo:true,bootstrapEmail:'owner@example.test',bootstrapPassword:'Test-only-pass-1234'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}/api/`;
  const request=async(p,body,cookie)=>{const r=await fetch(base+p,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try{
    assert.equal((await request('state')).status,401);
    const owner=(await request('login',{email:'owner@example.test',password:'Test-only-pass-1234'})).cookie;
    const garden=(await request('login',{email:'garden@example.test',password:'Test-only-pass-1234'})).cookie;
    const school=(await request('state',null,garden)).data;
    assert.deepEqual(school.locations.map(l=>l.id),['garden']);assert.equal(school.students.length,8);assert.equal(school.users.length,0);assert.equal(school.audit.length,0);
    assert(school.students.every(s=>s.versions.every(v=>!('allergy' in v)&&!('instructions' in v))));
    assert.equal((await request('production?date=2026-10-01',null,garden)).status,403);
    assert.equal((await request('projection?locationId=river&month=2026-10',null,garden)).status,403);
    assert.equal((await request('adjustment',{locationId:'garden',month:'2026-10',units:1,note:'No'},garden)).status,403);
    assert.equal((await request('codes',{A:'changed'},garden)).status,403);
    assert.equal((await request('location',{id:'garden'},garden)).status,403);
    const managed=school.students.find(s=>s.versions[0].billing==='clc');
    assert.equal((await request('exception',{studentId:managed.id,date:'2026-10-02',code:null},garden)).status,403);
    assert.equal((await request('note',{locationId:'river',month:'2026-10',note:'Cross-school'},garden)).status,403);
    assert.equal((await request('note',{locationId:'garden',month:'2026-10',note:'Please review two extra meals.'},garden)).status,200);
    const before=(await request('projection?locationId=garden&month=2026-10',null,owner)).data;
    assert.equal((await request('adjustment',{locationId:'garden',month:'2026-10',units:2,note:'Approved extra meals'},owner)).status,200);
    const after=(await request('projection?locationId=garden&month=2026-10',null,owner)).data;assert.equal(after.subtotalCents,before.subtotalCents+800);
    const all=(await request('state',null,owner)).data;
    assert.equal((await request('review-note',{id:all.notes[0].id,reply:'Applied two meals.',adjustmentId:all.adjustments[0].id},owner)).status,200);
    assert.equal((await request('invoice',{locationId:'garden',month:'2026-10'},owner)).status,200);
    assert.equal((await request('adjustment',{locationId:'garden',month:'2026-10',units:1,note:'After saved'},owner)).status,400);
    assert.equal((await request('closure',{locationId:'garden',date:'2026-10-02',note:'Closure'},owner)).status,200);
    const updated=(await request('state',null,owner)).data;assert.equal(updated.invoices[0].subtotalCents,after.subtotalCents);
    assert(updated.audit.some(a=>a.action==='Invoice subtotal saved'));assert.equal(updated.notes[0].status,'Reviewed');
    const cross=await fetch(base+'note',{method:'POST',headers:{'Content-Type':'application/json',cookie:garden,Origin:'https://attacker.invalid'},body:JSON.stringify({})});assert.equal(cross.status,403);
    await app.close();
    const reopened=createApp({dataDir:dir});assert.equal(JSON.parse(reopened.db.prepare('SELECT value FROM store').get().value).invoices[0].subtotalCents,after.subtotalCents);reopened.db.close();
  }finally{if(app.server.listening)await app.close();rmSync(dir,{recursive:true,force:true});}
});
