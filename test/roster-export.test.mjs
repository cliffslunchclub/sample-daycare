import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterRows, rosterCsv, rosterExcel, rosterHtml } from '../frontend/src/rosterExport.ts';
test('roster exports active students in the selected school with weekday substitutions', async () => {
 const student={id:'a',name:'Jane, Doe',daycare:'s',classroom:'c',active:true,service_days:['Monday','Wednesday']};
 const rows=rosterRows([student,{...student,id:'b',active:false},{...student,id:'z',daycare:'other'}],[{id:'c',name:'Preschool'}],[{student:'a',daycare:'s',recurring:true,weekday:'Wednesday',code:'V'}],'s');
 assert.deepEqual(rows,[['Preschool','Jane, Doe','Yes','No','Sub V','No','No']]);
 assert.match(await rosterCsv(rows).text(),/"Jane, Doe"/);
 assert.match(rosterHtml('School <one>',rows),/School &lt;one&gt;/);
 const xml=new TextDecoder().decode(await rosterExcel('School',rows).arrayBuffer());
 assert.match(xml,/dataValidation type="list"/);
 assert.match(xml,/conditionalFormatting/);
 assert.match(xml,/<formula1>LunchOptions<\/formula1>/);
 assert.match(xml,/Options!\$A\$1:\$A\$6/);
 for (const label of ['Yes','No','Sub A','Sub B','Sub C','Sub V']) assert.ok(xml.includes(`<t>${label}</t>`));
});
