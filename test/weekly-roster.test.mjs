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

test('Bergenfield live-data printout has summary first, consistent compact tables and natural page breaks',()=>{
 const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
 const data={
   school_name:'Lightbridge Bergenfield',start:'2026-11-09',end:'2026-11-13',as_of:'2026-11-12',
   days:days.map((day,index)=>({day,closed:false,total:[25,24,26,24,36][index],
     classrooms:[
       {name:'Mobile Infants',total:index===4?1:2,students:[{name:'Gia',sub:false}]},
       {name:'Goldfish',total:index===4?9:5,students:index===4?
         [{name:'Ade',sub:false},{name:'Amjad',sub:false},{name:'Andres',sub:false},{name:'Derek M',sub:false},
         {name:'Ethan',sub:false},{name:'Lucas',sub:false},{name:'Margo',sub:false},{name:'Oliver',sub:false},{name:'Starling',sub:false}]:
         [{name:'Andres',sub:true},{name:'Ethan',sub:false}]},
       {name:'Yellow Ducks',total:index===4?8:3,students:[{name:'Leo (veg)',sub:index<4}]},
     ]})),
 };
 data.days[0].classrooms[0].students.push({name:'Amenze <A>',sub:false});
 const html=weeklyRosterHtml(data);
 assert.match(html,/letter portrait/);
 assert.match(html,/roster-matrix/);
 assert.ok(!html.includes('class="matrix-page"'),'No artificial three-classrooms-per-page partitions');
 assert.ok(!html.includes('Page 1 / 3'),'No hardcoded page numbers');
 assert.ok(html.indexOf('class="matrix-summary"')<html.indexOf('class="matrix-room"'),'Summary is at top of printout');
 assert.equal((html.match(/class="matrix-room"/g)||[]).length,8,'Each classroom is its own unbreakable table');
 assert.ok(html.indexOf('Mobile Infants')<html.indexOf('Purple Cats'));
 assert.ok(html.indexOf('Purple Cats')<html.indexOf('Khaki Kangaroo'));
 assert.ok(html.indexOf('Khaki Kangaroo')<html.indexOf('Yellow Ducks'));
 assert.ok(html.indexOf('Goldfish')<html.indexOf('Brown Bears'));
 assert.match(html,/<th scope="col">Monday<\/th><th scope="col">Tuesday<\/th><th scope="col">Wednesday<\/th><th scope="col">Thursday<\/th><th scope="col">Friday<\/th>/);
 assert.match(html,/class="matrix-total"/);
 assert.match(html,/color:#bb2a27/);
 assert.match(html,/class="matrix-grand-total"/);
 assert.match(html,/Daily Total<\/th><td>25<\/td><td>24<\/td><td>26<\/td><td>24<\/td><td>36<\/td><td>135<\/td>/);
 assert.match(html,/Leo \(veg\)/);
 assert.match(html,/\(Sub\)/);
 assert.match(html,/&lt;A&gt;/);
 assert.ok(!html.includes('Amenze <A>'),'Escaping must apply in the new matrix');
 assert.ok(!html.includes('(2)')&&!html.includes('(3)'),'No internal pizza-slice markers');
 assert.match(html,/9<\/td>/,'Goldfish Friday total must be displayed');
 assert.match(html,/8<\/td>/,'Yellow Ducks Friday total must be displayed');
 assert.match(html,/break-inside:avoid;page-break-inside:avoid/,'No classroom may be split over a page');
 assert.ok(!/break-after:page;page-break-after:always/.test(html),'Do not force page breaks between groups');
 assert.match(html,/\.roster-matrix \.matrix-grid tbody td\{font-size:10\.6px/);
 assert.match(html,/\.roster-matrix \.matrix-summary-table tbody td\{font-size:10\.5px/);
 const roomSections=[...html.matchAll(/<section class="matrix-room">[\s\S]*?<\/section>/g)].map(match=>match[0]);
 const mobile=roomSections.find(section=>section.includes('>Mobile Infants</th>'));
 assert.ok(mobile);
 assert.equal((mobile.match(/<tr>/g)||[]).length,4,'Only two body rows and two heading rows; no blank padding');
 assert.equal((mobile.match(/class="matrix-total"/g)||[]).length,1,'One total row at bottom');
 const goldfish=roomSections.find(section=>section.includes('>Goldfish</th>'));
 assert.ok(goldfish);
 assert.equal((goldfish.match(/<tr>/g)||[]).length,11,'Nine student rows and two heading rows');
 assert.equal((goldfish.match(/class="matrix-total"/g)||[]).length,1,'One total row at bottom');
 const app=fs.readFileSync(new URL('../frontend/src/WeeklyRoster.tsx',import.meta.url),'utf8');
 assert.match(app,/matrix-preview/,'Live in-app preview uses the same sizing');
});

test('Bergenfield closed days and schools with zero lunches keep zero counts without fabricated names',()=>{
 const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
 const data={school_name:'Lightbridge Bergenfield',start:'2026-11-09',end:'2026-11-13',as_of:'2026-11-12',
   days:days.map((day,index)=>({day,closed:index===2,total:index===2?0:1,
     classrooms:index===2?[]:[{name:'Purple Cats',total:1,students:[{name:'Ethan',sub:false}]}]}))};
 const html=weeklyRosterHtml(data);
 assert.match(html,/No lunch service/);
 assert.match(html,/Daily Total<\/th><td>1<\/td><td>1<\/td><td>0<\/td><td>1<\/td><td>1<\/td><td>4<\/td>/);
 assert.equal((html.match(/class="matrix-room"/g)||[]).length,8);
 assert.match(html,/class="matrix-grand-total"/);
});
