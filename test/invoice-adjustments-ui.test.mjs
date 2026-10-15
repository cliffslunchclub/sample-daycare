import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
function component(){
 const source=ts.createSourceFile('Billing.tsx',fs.readFileSync(new URL('../frontend/src/Billing.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),node=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='InvoicesPage');
 const code=ts.transpileModule(node.getText(source).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 let cursor=0;const states=[],calls=[];
 const context={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=v;}];},useEffect(){},React:{createElement:(type,props,...children)=>({type,props:props||{},children})},today:()=> '2026-10-15',PageTitle:'Title',CollapsiblePanel:'Panel',DateField:'Date',MonthField:'Month',money:n=>'$'+(n/100).toFixed(2),invoiceDate:s=>s,invoiceMonth:s=>s,invoiceDatesInText:s=>s,invoiceBreakdownText:s=>s,showInvoiceTerms:()=>false,api:async(school,body)=>{calls.push(body);return {items:[]};},pb:{filter:()=>'',collection:()=>({getFullList:async()=>[]})},window:{confirm:()=>true}};
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
