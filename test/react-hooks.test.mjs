import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

test('AdminApp calls all hooks before any conditional return', () => {
  const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../frontend/src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const admin = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AdminApp');
  assert.ok(admin?.body);
  let returned = false;
  for (const statement of admin.body.statements) {
    // Nested function bodies are independent components or event handlers.
    if (ts.isFunctionDeclaration(statement)) continue;
    function inspect(node) {
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^use[A-Z]/.test(node.expression.text)) assert.equal(returned, false, `${node.expression.text} occurs after an early return`);
      if (ts.isReturnStatement(node)) returned = true;
      ts.forEachChild(node, inspect);
    }
    inspect(statement);
  }
});

test('school-admin load replaces All daycares with assigned school and ignores stale responses', async () => {
  const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../frontend/src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const admin = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AdminApp');
  const load = admin.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'load');
  const js = ts.transpileModule(load.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const { runInNewContext } = await import('node:vm');
  let selected = 'all', rendered = 0;
  const user = { id: 'staff', role: 'daycare_admin', daycare: 'school' };
  const context = {
    user, isClc: false, loadVersion: { current: 0 }, message: String,
    pb: { send:()=>Promise.resolve({ready:true}), authStore: { model: user }, collection: name => ({ getFullList: () => Promise.resolve(name === 'daycares' ? [{ id: 'school' }] : []) }) },
    setBusy: () => {}, setError: () => {}, setSelected: callback => { selected = callback(selected); },
    setDaycares: () => { rendered++; }, setClassrooms: () => {}, setStudents: () => {}, setScheduleHistory: () => {}, setSubs: () => {}, setMenuDays: () => {}, setMenuItems: () => {},
  };
  runInNewContext(js, context);
  await context.load();
  assert.equal(selected, 'school');
  assert.equal(rendered, 1);
  // Resolve an earlier request after another load/account change invalidates it.
  const pending = [];
  context.pb.collection = () => ({ getFullList: () => new Promise(resolve => pending.push(resolve)) });
  const oldLoad = context.load();
  await new Promise(resolve => setImmediate(resolve));
  context.loadVersion.current++;
  for (const resolve of pending) resolve([]);
  await oldLoad;
  assert.equal(rendered, 1);
  assert.equal(selected, 'school');
});

test('weekly summary keeps allergy meals in totals and Subs, excluding them from Standard', async () => {
  const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../frontend/src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const summary = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'WeeklySummary');
  const js = ts.transpileModule(summary.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const { runInNewContext } = await import('node:vm');
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const context = { studentScheduled:s=>s.active, scheduledStudentsForDate:()=>[], weekDates:()=>weekdays, weekdays, CollapsiblePanel: 'CollapsiblePanel', React: { createElement: (type, props, ...children) => ({ type, props, children }) } };
  runInNewContext(js, context);
  const tree = context.WeeklySummary({ locations: [{ id: 'fl', name: 'Lightbridge Fort Lee', public_slug: 'lightbridge-fort-lee', count_mode: 'manual', baseline_counts: Object.fromEntries(weekdays.map(day => [day, 62])), clc_managed_counts: Object.fromEntries(weekdays.map(day => [day, 2])) }], students: [], history: [], subs: [] });
  const nodes = [];
  function walk(node) { if (Array.isArray(node)) node.forEach(walk); else if (node && typeof node === 'object') { nodes.push(node); walk(node.children); } }
  walk(tree);
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.children) : node === false || node == null ? '' : String(node);
  const row = nodes.find(node => node.type === 'tr' && node.props?.key === 'Monday:all');
  assert.deepEqual(row.children.filter(node => node?.type === 'td').map(text), ['64', '62', '2', '2 Allergies']);
  assert.ok(nodes.some(node => node.type === 'th' && text(node) === 'Standard'));
  const pizza = nodes.find(node => node.type === 'tr' && text(node).includes('Friday pizza'));
  assert.ok(pizza);
  assert.equal(text(pizza.children.find(node => node?.type === 'td')), '22');
});


test('notes and roster use distinct sibling keys during search updates', async () => {
  const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../frontend/src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'SchoolStudentsPage');
  const js = ts.transpileModule(component.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const { runInNewContext } = await import('node:vm');
  const context = { useState:initial=>[initial,()=>{}], WeeklyRoster:'weekly', PageTitle:'title', Empty:'empty', NotesRequests:'notes', CountSettings:'counts', StudentsPage:'roster', CollapsiblePanel:'panel', React:{createElement:(type,props,...children)=>({type,props,children})} };
  runInNewContext(js,context);
  const tree=context.SchoolStudentsPage({subs:[],current:{id:'school',count_mode:'roster',operations_enabled:true},isClc:true,students:[],classrooms:[]});
  const keys=tree.children.filter(child=>child && child.props?.key).map(child=>child.props.key);
  assert.equal(new Set(keys).size,keys.length,'sibling components must not reuse a key');
});

test('every school overview stacks the meal total above its standard/substitution breakdown', async()=>{
 const source=ts.createSourceFile('App.tsx',readFileSync(new URL('../frontend/src/App.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),component=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='WeeklySummary');
 const code=ts.transpileModule(component.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 const {runInNewContext}=await import('node:vm');const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday'];const context={studentScheduled:s=>s.active,scheduledStudentsForDate:(students,_history,schoolId,day)=>students.filter(s=>s.active&&s.daycare===schoolId&&s.service_days.includes(day)),weekDates:()=>weekdays,weekdays,titleCase:s=>s,SubstitutionNames:'Subs',CollapsiblePanel:'Panel',React:{createElement:(type,props,...children)=>({type,props:props||{},children})}};runInNewContext(code,context);
 const locations=[{id:'bf',name:'Lightbridge Bergenfield',public_slug:'lightbridge-bergenfield',sizes_enabled:true,count_mode:'roster'},{id:'fl',name:'Lightbridge Fort Lee',public_slug:'lightbridge-fort-lee',count_mode:'manual',baseline_counts:{Monday:60},clc_managed_counts:{Monday:2}},{id:'tle',name:'TLE Englewood Cliffs',public_slug:'tle-englewood-cliffs',count_mode:'manual',baseline_counts:{Monday:120,Friday:10}}];
 const tree=context.WeeklySummary({locations,students:[{id:'kid',daycare:'bf',active:true,size:'small',service_days:['Monday']}],history:[],subs:[]});const all=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){all.push(n);walk(n.children);}}walk(tree);
 const overview=all.find(n=>n.type==='table'&&n.props.className==='summary-overview');const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):n==null||n===false?'':String(n);
 for(const [id,total,breakdown]of [['bf','1','1 Small'],['fl','62','60 Standard + 2 Subs'],['tle','120','120 Standard']]){
  const row=overview.children[1].children[1].find(n=>n.props.key===id),monday=row.children[0][0],parts=monday.children.filter(n=>n&&typeof n==='object');assert.equal(parts[1].props.className,'summary-meal-total');assert.equal(text(parts[1]),total);assert.ok(text(parts[2]).includes(breakdown));
 }
 const tle=overview.children[1].children[1].find(n=>n.props.key==='tle');assert.equal(text(tle.children[0][4].children[1]),'10');
});
