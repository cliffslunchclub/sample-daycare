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
    pb: { authStore: { model: user }, collection: name => ({ getFullList: () => Promise.resolve(name === 'daycares' ? [{ id: 'school' }] : []) }) },
    setBusy: () => {}, setError: () => {}, setSelected: callback => { selected = callback(selected); },
    setDaycares: () => { rendered++; }, setClassrooms: () => {}, setStudents: () => {}, setSubs: () => {}, setMenuDays: () => {}, setMenuItems: () => {},
  };
  runInNewContext(js, context);
  await context.load();
  assert.equal(selected, 'school');
  assert.equal(rendered, 1);
  // Resolve an earlier request after another load/account change invalidates it.
  const pending = [];
  context.pb.collection = () => ({ getFullList: () => new Promise(resolve => pending.push(resolve)) });
  const oldLoad = context.load();
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
  const context = { weekdays, CollapsiblePanel: 'CollapsiblePanel', React: { createElement: (type, props, ...children) => ({ type, props, children }) } };
  runInNewContext(js, context);
  const tree = context.WeeklySummary({ locations: [{ id: 'fl', name: 'Lightbridge Fort Lee', public_slug: 'lightbridge-fort-lee', count_mode: 'manual', baseline_counts: Object.fromEntries(weekdays.map(day => [day, 62])), clc_managed_counts: Object.fromEntries(weekdays.map(day => [day, 2])) }], students: [], subs: [] });
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
  const context = { PageTitle:'title', Empty:'empty', NotesRequests:'notes', CountSettings:'counts', StudentsPage:'roster', CollapsiblePanel:'panel', React:{createElement:(type,props,...children)=>({type,props,children})} };
  runInNewContext(js,context);
  const tree=context.SchoolStudentsPage({subs:[],current:{id:'school',count_mode:'roster',operations_enabled:true},isClc:true,students:[],classrooms:[]});
  const keys=tree.children.filter(child=>child && child.props?.key).map(child=>child.props.key);
  assert.equal(new Set(keys).size,keys.length,'sibling components must not reuse a key');
});
