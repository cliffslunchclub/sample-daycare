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
