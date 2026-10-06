import test from 'node:test';
import assert from 'node:assert/strict';
import { menuExportHtml, menuExportDocx, menuFilename } from '../frontend/src/menuExport.ts';

test('menu export aligns dates to weekday columns and escapes menu text', () => {
  const calls = [];
  const html = menuExportHtml('School <one>', '2026-10', date => { calls.push(date); return { menu: 'Pasta & peas\nGarlic bread', closed: date === '2026-10-12' }; });
  assert.equal(calls.length, 22);
  assert.ok(html.includes('School &lt;one&gt;'));
  assert.ok(html.includes('Pasta &amp; peas<br>Garlic bread'));
  assert.match(html, /09-28-2026[\s\S]*09-29-2026[\s\S]*09-30-2026[\s\S]*10-01-2026[\s\S]*10-02-2026/);
  assert.ok(html.includes('No Lunch Service'));
  assert.ok(html.includes('bgcolor="#e7eee8"'));
  assert.ok(html.includes('bgcolor="#ffffff"'));
  assert.ok(html.includes('bgcolor="#ffffff"'));
  assert.ok(html.includes('bgcolor="#f0f1f0"'));
});

test('month starting on weekend has no empty leading week', () => {
  const html = menuExportHtml('School', '2026-11', () => ({ menu: 'Lunch' }));
  assert.ok(!html.includes('10-26-2026'));
  assert.ok(html.includes('11-02-2026'));
  assert.ok(html.includes('11-30-2026'));
});


test('Word download is a native DOCX and includes the selected month in filename and heading', async () => {
  assert.equal(menuFilename('Lightbridge Fort Lee', '2026-10'), 'Lightbridge Fort Lee Menu October 2026.docx');
  const doc = menuExportDocx('Lightbridge Fort Lee', '2026-10', () => ({ menu: 'Pasta & peas' }));
  assert.equal(doc.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const bytes = new Uint8Array(await doc.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [80, 75, 3, 4]);
  const contents = new TextDecoder().decode(bytes);
  assert.ok(contents.includes('October 2026'));
  assert.ok(contents.includes('Pasta &amp; peas'));
  assert.ok(contents.includes('word/header1.xml'));
  assert.ok(contents.includes('w:fill="FFFFFF"'));
  assert.ok(contents.includes('w:orient="landscape"'));
  assert.ok(contents.includes('09-28-2026'));
  assert.ok(contents.includes('<w:jc w:val="center"/>'));
  assert.ok(contents.includes('<w:b/>'));
});
