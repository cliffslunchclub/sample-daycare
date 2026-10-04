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
