import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {weeklyRosterHtml} from '../frontend/src/weeklyRoster.ts';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
function load(name,extra={}){const c={module:{exports:{}},...extra};vm.runInNewContext(fs.readFileSync(new URL('../pb_hooks/'+name,import.meta.url),'utf8'),c);return c.module.exports;}
const billing=load('billing-lib.js');
const row=(id,data)=>({id,getString:k=>typeof data[k]==='object'?JSON.stringify(data[k]):String(data[k]??''),getInt:k=>Number(data[k]||0),getBool:k=>Boolean(data[k])});
function fixture(){
 const school=row('school',{name:'QA School'}),history=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'roster',invoice_rate:4}},{entity:'kid',effective_date:'2026-10-01',snapshot:{name:'Amenze',active:true,service_days:['Monday','Wednesday']}},{entity:'kid',effective_date:'2026-10-19',snapshot:{name:'Amenze',active:true,service_days:['Monday','Tuesday','Wednesday'],classroom:'purple'}}];
 const d={school:{public_slug:'qa'},history,menus:[{service_date:'2026-10-14',closed:true}],requests:[{kind:'lunch',status:'approved',student_label:'Joe',service_date:'2026-10-15',classroom_label:'Purple Cats',code:'A',archived:true},{kind:'lunch',status:'pending',student_label:'Pending student',service_date:'2026-10-12'},{kind:'lunch',status:'approved',student:'kid',student_label:'Amenze',service_date:'2026-10-12'}]};
 const app={findRecordsByFilter:type=>type==='classrooms'?[row('infants',{name:'Mobile Infants',age_order:1}),row('purple',{name:'Purple Cats',age_order:2})]:type==='students'?[row('kid',{name:'Amenze',classroom:'purple'})]:type==='substitutions'?[row('sub',{student:'kid',service_date:'2026-10-05',weekday:'Monday',recurring:true,code:'V'})]:type==='audit_logs'?[row('move',{entity_id:'kid',effective_date:'2026-10-19',changes:{classroom:{before:'infants',after:'purple'}}})]:[]};
 const l=load('weekly-roster-lib.js',{__hooks:'hooks',require:p=>p.endsWith('billing-lib.js')?billing:{data:()=>d}});return {l,d,app,school};
}
test('current-week actual roster honors effective dates, closures, classroom history, substitutions and approved archived one-offs',()=>{
 const f=fixture(),result=f.l.build(f.app,f.school,'2026-10-15');assert.equal(result.start,'2026-10-12');assert.equal(result.end,'2026-10-16');assert.equal(result.as_of,'2026-10-15');
 assert.equal(result.days[0].total,1);assert.equal(result.days[0].classrooms[0].name,'Mobile Infants');assert.equal(result.days[0].classrooms[0].students[0].sub,true);
 assert.equal(result.days[1].total,0);assert.equal(result.days[2].closed,true);assert.equal(result.days[2].total,0);assert.equal(result.days[3].total,1);assert.equal(result.days[3].classrooms[0].students[0].name,'Joe');assert.equal(result.days[3].classrooms[0].students[0].sub,true);
 const next=f.l.build(f.app,f.school,'2026-10-20');assert.equal(next.days[1].total,1);assert.equal(next.days[1].classrooms[0].name,'Purple Cats');
});
test('manual counts remain counts instead of inventing student names, and weekends use the same calendar week',()=>{
 const f=fixture();f.d.history[0].snapshot={count_mode:'manual',baseline_counts:{Monday:10},clc_managed_counts:{Monday:2},invoice_rate:4};const result=f.l.build(f.app,f.school,'2026-10-18');assert.equal(result.start,'2026-10-12');assert.equal(result.days[0].total,12);assert.ok(result.days[0].classrooms.every(c=>c.students.length===0));
});
test('printable roster escapes names, uses only Sub labels, has current-week headers, totals and landscape pagination',()=>{
 const f=fixture(),data=f.l.build(f.app,f.school,'2026-10-15');data.school_name='<School>';data.days[0].classrooms[0].students[0].name='<script>alert(1)</script>';
 const html=weeklyRosterHtml(data);assert.match(html,/10-12-2026 to 10-16-2026/);assert.match(html,/As of 10-15-2026/);assert.match(html,/letter landscape/);assert.match(html,/\(Sub\)/);assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));assert.match(html,/No Lunch Service/);assert.match(html,/1 lunch/);assert.match(html,/break-inside:avoid/);
});
test('weekly roster endpoint rejects anonymous, inactive, wrong-school and other-role access before loading data',()=>{
 let handler;vm.runInNewContext(fs.readFileSync(new URL('../pb_hooks/weekly-roster.pb.js',import.meta.url),'utf8'),{routerAdd:(_m,_p,h)=>{handler=h;}});
 for(const auth of [null,row('u',{active:false,role:'clc_admin'}),row('u',{active:true,role:'daycare_admin',daycare:'other'}),row('u',{active:true,role:'parent',daycare:'school'})]){let status;handler({auth,requestInfo:()=>({body:{daycare:'school'}}),json:code=>{status=code;}});assert.equal(status,403);}
});
test('the current-week roster is above Notes; all other Students & Classrooms panels default collapsed',()=>{
 const app=fs.readFileSync(new URL('../frontend/src/App.tsx',import.meta.url),'utf8'),source=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const page=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='SchoolStudentsPage').getText(source);assert.ok(page.indexOf('<WeeklyRoster')<page.indexOf('<NotesRequests'));
 for(const name of ['CountSettings','StudentEditor','StudentsPage']){const code=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(source);assert.ok(!code.includes('defaultExpanded={true}'));assert.match(code,/defaultExpanded=\{false\}/);}
 assert.match(app,/sub-panel[\s\S]*?defaultExpanded=\{false\}/);
 assert.match(fs.readFileSync(new URL('../frontend/src/Billing.tsx',import.meta.url),'utf8'),/defaultExpanded=\{false\} className="panel panel-stack notes-requests"/);
 assert.match(fs.readFileSync(new URL('../frontend/src/WeeklyRoster.tsx',import.meta.url),'utf8'),/defaultExpanded=\{true\}/);
});

test('inclusive last-lunch dates retain earlier lunches and exclude later service days',()=>{
 const f=fixture();f.d.menus=[];f.d.history[1].snapshot.last_lunch_date='2026-10-12';const out=f.l.build(f.app,f.school,'2026-10-15');assert.equal(out.days[0].total,1);assert.equal(out.days[2].total,0);
});

test('current student names are consistent across dated attendance and linked one-off lunches, with historical fallback for deleted students',()=>{
 const f=fixture();f.d.menus=[];f.d.history[1].snapshot.name='Leo Stern (veg)';
 const original=f.app.findRecordsByFilter;f.app.findRecordsByFilter=type=>type==='students'?[row('kid',{name:'Leo Stern',classroom:'purple'})]:original(type);
 f.d.requests.push({kind:'lunch',status:'approved',student:'kid',student_label:'Leo Stern (veg)',service_date:'2026-10-16',classroom_label:'Purple Cats'});
 const out=f.l.build(f.app,f.school,'2026-10-15');for(const index of [0,2,4])assert.equal(out.days[index].classrooms.flatMap(c=>c.students).find(s=>s.name.startsWith('Leo')).name,'Leo Stern');
 assert.equal(out.days[1].total,0);assert.equal(f.d.history[1].snapshot.name,'Leo Stern (veg)');
 f.app.findRecordsByFilter=type=>type==='students'?[]:original(type);const past=f.l.build(f.app,f.school,'2026-10-15');assert.equal(past.days[0].classrooms[0].students[0].name,'Leo Stern (veg)');
});
