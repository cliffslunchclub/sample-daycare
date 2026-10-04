import test from 'node:test';
import assert from 'node:assert/strict';
import { menuExportHtml } from '../frontend/src/menuExport.ts';

test('menu export aligns dates to weekday columns and escapes menu text', () => {
  const calls = [];
  const html = menuExportHtml('School <one>', '2026-10', date => { calls.push(date); return { menu: 'Pasta & peas\nGarlic bread', closed: date === '2026-10-12' }; });
  assert.equal(calls.length, 22);
  assert.ok(html.includes('School &lt;one&gt;'));
  assert.ok(html.includes('Pasta &amp; peas<br>Garlic bread'));
  assert.match(html, /9\/28\/26[\s\S]*9\/29\/26[\s\S]*9\/30\/26[\s\S]*10\/1\/26[\s\S]*10\/2\/26/);
  assert.ok(html.includes('No lunch service'));
  assert.ok(html.includes('bgcolor="#1c528e"'));
  assert.ok(html.includes('bgcolor="#d9ead3"'));
  assert.ok(html.includes('bgcolor="#fff2cc"'));
  assert.ok(html.includes('bgcolor="#f4cccc"'));
});

test('month starting on weekend has no empty leading week', () => {
  const html = menuExportHtml('School', '2026-11', () => ({ menu: 'Lunch' }));
  assert.ok(!html.includes('10/26/26'));
  assert.ok(html.includes('11/2/26'));
  assert.ok(html.includes('11/30/26'));
});
