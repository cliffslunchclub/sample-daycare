import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {invoiceRows,pendingRows} from '../frontend/src/invoiceLines.ts';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
function component(){
 const source=ts.createSourceFile('Billing.tsx',fs.readFileSync(new URL('../frontend/src/Billing.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),node=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='InvoicesPage');
 const code=ts.transpileModule(node.getText(source).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 let cursor=0;const states=[],calls=[];
 const context={invoiceRows,pendingRows,useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=v;}];},useEffect(){},React:{createElement:(type,props,...children)=>({type,props:props||{},children})},today:()=> '2026-10-15',PageTitle:'Title',CollapsiblePanel:'Panel',DateField:'Date',MonthField:'Month',money:n=>'$'+(n/100).toFixed(2),invoiceDate:s=>s,invoiceMonth:s=>s,invoiceDatesInText:s=>s,invoiceBreakdownText:s=>s,showInvoiceTerms:()=>false,api:async(school,body)=>{calls.push(body);return {items:[]};},pb:{filter:()=>'',collection:()=>({getFullList:async()=>[]})},window:{confirm:()=>true}};
 vm.runInNewContext(code,context);return {states,calls,render(props){cursor=0;return context.InvoicesPage(props);}};
}
function nodes(tree){const out=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){out.push(n);visit(n.children);}}visit(tree);return out;}
function text(n){return Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):n==null||n===false?'':String(n);}
const props={schools:[{id:'school',name:'School'}],currentId:'school'};
const draft={id:'nov',number:'BF1126',month:'2026-11',status:'draft',shared:true,invoice_date:'2026-10-15',lines:[{description:'Lunch',baseline:true,quantity:20,rate:4,taxable:true}],notes:'',generated_notes:'Breakdown',daily_counts:[],total_cents:8530,tax_cents:530};
test('pending adjustment controls are superadmin-only and never apply on loading',()=>{
 for(const isClc of [true,false]){const c=component();c.render({...props,isClc});c.states[3]=[draft];c.states[11]=[{id:'oct::k',label:'Killian',source_number:'BF1026',source_end:'2026-10-31',quantity:2,rate:4,amount_cents:800,service_dates:['2026-10-20','2026-10-27']}];c.states[12]=['oct::k'];c.states[13]='nov';
  const tree=c.render({...props,isClc}),all=nodes(tree);assert.equal(text(tree).includes('Pending Invoice Adjustments'),isClc);assert.equal(c.calls.length,0);
  if(isClc){assert.equal(all.find(n=>n.type==='button'&&text(n)==='Add Selected to Draft').props.disabled,false);assert.match(text(tree),/Killian/);assert.match(text(tree),/2026-10-20, 2026-10-27/);}
 }
});
test('saved invoices offer Close Invoice while closed invoices have no edit or recalculate controls',()=>{
 const c=component();c.render({...props,isClc:true});c.states[5]=draft;let tree=c.render({...props,isClc:true});assert.ok(nodes(tree).some(n=>n.type==='button'&&text(n)==='Close Invoice'));
 c.states[5]={...draft,status:'closed'};tree=c.render({...props,isClc:true});const buttons=nodes(tree).filter(n=>n.type==='button').map(text);
 assert.ok(!buttons.includes('Save Invoice'));assert.ok(!buttons.includes('Recalculate'));assert.ok(!buttons.includes('Delete Draft'));assert.match(text(tree),/billed amounts are frozen/);
});

test('grouped one-off removal submits every original line and the baseline has no remove control',async()=>{
 const c=component();c.render({...props,isClc:true});const lines=[draft.lines[0],...['2026-11-03','2026-11-05'].map((date,i)=>({description:'One-off lunch: Bilal ('+date+')',request_id:'r'+i,request_label:'Bilal',service_dates:[date],quantity:1,rate:4,taxable:true}))];c.states[5]={...draft,lines};
 const tree=c.render({...props,isClc:true}),buttons=nodes(tree).filter(n=>n.type==='button'&&text(n)==='Remove Adjustment');assert.equal(buttons.length,1);assert.match(nodes(tree).find(n=>n.type==='textarea'&&n.props['aria-label']==='Description'&&String(n.props.value).includes('2 one-off lunches')).props.value,/2 one-off lunches/);
 buttons[0].props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.calls[0].action,'remove-adjustments');assert.equal(c.calls[0].lines.length,2);assert.equal(c.calls[0].lines[0],JSON.stringify(lines[1]));
 assert.equal(nodes(tree).filter(n=>n.type==='button'&&text(n)==='Remove').length,0);
});

test('pending differences offer Dismiss only to superadmins',async()=>{
 for(const isClc of [true,false]){const c=component();c.render({...props,isClc});c.states[11]=[{id:'pending',token:'reviewed',label:'Bilal',source_number:'BF1026',service_dates:[],quantity:1,rate:4,amount_cents:400}];const buttons=nodes(c.render({...props,isClc})).filter(n=>n.type==='button'&&text(n)==='Dismiss');assert.equal(buttons.length,isClc?1:0);if(isClc){buttons[0].props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.calls[0].action,'dismiss-pending');assert.equal(c.calls[0].items[0].token,'reviewed');}}
});

test('eleven pending one-off lunches use one row, checkbox and Dismiss action, while applying every underlying item',async()=>{
 const c=component();c.render({...props,isClc:true});c.states[3]=[draft];
 const dates=['16','19','20','21','22','23','26','27','28','29','30'];
 const lunches=dates.map(day=>({id:'request-'+day,token:'token-'+day,source_id:'oct',source_number:'BF1026',source_end:'2026-10-31',request_id:'request-'+day,label:'Bilal',service_dates:['2026-10-'+day],quantity:1,previous_quantity:0,current_quantity:1,rate:4,amount_cents:400}));
 c.states[11]=[...lunches,{...lunches[0],id:'killian',request_id:undefined,label:'Killian',quantity:2,amount_cents:800}];c.states[13]='nov';
 let tree=c.render({...props,isClc:true});assert.equal(nodes(tree).filter(n=>n.type==='input'&&n.props['aria-label']==='Select adjustment for Bilal').length,1);assert.equal(nodes(tree).filter(n=>n.type==='button'&&text(n)==='Dismiss').length,2);assert.match(text(tree),/\$44.00/);assert.match(text(tree),/Scheduled: 11/);
 nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='Select adjustment for Bilal').props.onChange({target:{checked:true}});
 tree=c.render({...props,isClc:true});nodes(tree).find(n=>n.type==='button'&&text(n)==='Add Selected to Draft').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.calls[0].action,'apply-pending');assert.equal(c.calls[0].items.length,11);assert.ok(c.calls[0].items.every(x=>x.id.startsWith('request-')));
});

test('group Dismiss sends all member tokens in one request',async()=>{
 const c=component();c.render({...props,isClc:true});c.states[11]=['a','b'].map(id=>({id,token:id,source_id:'oct',source_number:'BF1026',request_id:id,label:'Bilal',service_dates:['2026-10-20'],quantity:1,rate:4,amount_cents:400}));
 nodes(c.render({...props,isClc:true})).find(n=>n.type==='button'&&text(n)==='Dismiss').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.calls[0].action,'dismiss-pending');assert.equal(c.calls[0].items.length,2);
});
