import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {invoiceRows} from '../frontend/src/invoiceLines.ts';
import {invoicePrintHtml} from '../frontend/src/invoicePrint.ts';
import {invoicePdf} from '../frontend/src/invoicePdf.ts';
function lunch(id,date,extra={}){return {description:'One-off lunch: Bilal ('+date+')',quantity:1,rate:4,taxable:true,request_id:id,request_label:'Bilal',service_dates:[date],...extra};}
test('one-off rows group the same student and rate, preserve dates, amounts and individual indices',()=>{
 const lines=[lunch('a','2026-10-30'),lunch('b','2026-10-20'),lunch('c','2026-10-26',{rate:3.5}),lunch('d','2026-10-21',{request_label:'Other Student'}),lunch('e','2026-10-22',{quantity:-1})];
 const rows=invoiceRows(lines);assert.equal(rows.length,4);assert.equal(rows[0].line.quantity,2);assert.equal(rows[0].line.amount_cents,800);assert.deepEqual(rows[0].indices,[0,1]);assert.match(rows[0].line.description,/10-20-2026, 10-30-2026/);assert.equal(lines[0].quantity,1);
});
test('legacy one-off lines group with newly tracked lines, without merging different known students',()=>{
 const old={description:'One-off lunch: Bilal (10-20-2026)',quantity:1,rate:4,taxable:true,request_id:'a'};
 const fresh=lunch('b','2026-10-30',{request_student:'kid'});const rows=invoiceRows([old,fresh]);assert.equal(rows.length,1);
 assert.equal(invoiceRows([fresh,lunch('c','2026-10-27',{request_student:'otherkid'})]).length,2);
});
test('grouped print HTML and PDF contain one lunch row with all dates and the unchanged invoice total',async()=>{
 const i={id:'i',school_name:'School',number:'BF1126',month:'2026-11',invoice_date:'2026-10-15',status:'draft',lines:[lunch('a','2026-11-03'),lunch('b','2026-11-05')],daily_counts:[],notes:'',subtotal_cents:800,tax_cents:53,total_cents:853};
 const html=invoicePrintHtml(i);assert.equal((html.match(/<strong>One-off Lunch<\/strong>/g)||[]).length,1);assert.match(html,/Bilal — 2 one-off lunches \(11-03-2026, 11-05-2026\)/);assert.match(html,/\$8.53/);
 const pdf=await invoicePdf(i).text();assert.match(pdf,/2 one-off lunches/);assert.match(pdf,/11-03-2026/);assert.match(pdf,/11-05-2026/);assert.match(pdf,/8.53/);
});
test('omitted schedule adjustments modify the billed reference without changing the scheduled snapshot',()=>{
 const c={module:{exports:{}},__hooks:'hooks',require:p=>p.endsWith('invoice-adjustment-lib.js')?{key:(entity,rate)=>entity+'|'+rate*100}:{}};
 vm.runInNewContext(fs.readFileSync(new URL('../pb_hooks/invoice-controls.js',import.meta.url),'utf8'),c);
 const line={description:'Add',quantity:2,rate:4,schedule_entity:'student:kid',student_label:'Bilal',service_dates:['2026-10-20','2026-10-27']};
 const invoice={getString:()=>JSON.stringify([{key:c.module.exports.key(line),line}])};const reference={units:{'student:kid|400':{entity:'student:kid',rate:4,quantity:7,dates:['2026-10-20','2026-10-27','2026-10-30']}}};
 const result=c.module.exports.adjustedReference(invoice,reference);assert.equal(result.units['student:kid|400'].quantity,5);assert.equal(reference.units['student:kid|400'].quantity,7);assert.deepEqual(Array.from(result.units['student:kid|400'].dates),['2026-10-30']);
});
