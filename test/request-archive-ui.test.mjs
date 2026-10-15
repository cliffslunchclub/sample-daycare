import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
function component(confirm=true){
 const source=ts.createSourceFile('Billing.tsx',fs.readFileSync(new URL('../frontend/src/Billing.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),node=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='NotesRequests');
 const code=ts.transpileModule(node.getText(source).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 let cursor=0;const states=[],calls=[],prompts=[];
 const c={window:{confirm:message=>{prompts.push(message);return confirm;}},useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=v;}];},useEffect(){},React:{createElement:(type,props,...children)=>({type,props:props||{},children})},CollapsiblePanel:'Panel',LunchDatePicker:'Picker',invoiceDate:s=>s,api:async(_school,body)=>{calls.push(body);return {message:'Saved'};},pb:{filter:()=>'',collection:()=>({getFullList:async()=>[]})}};
 vm.runInNewContext(code,c);return {states,calls,prompts,render(props){cursor=0;return c.NotesRequests(props);}};
}
function nodes(n){if(Array.isArray(n))return n.flatMap(nodes);return n&&typeof n==='object'?[n,...nodes(n.children)]:[];}
function text(n){return Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):n==null||n===false?'':String(n);}
const props={school:{id:'school',name:'School'},students:[],classrooms:[]};
const rows=[{id:'a',kind:'note',note:'Active message',status:'new'},{id:'b',kind:'lunch',note:'Archived message',status:'approved',student_label:'Bilal',service_date:'2026-11-03',archived:true}];
test('only superadmins can archive or restore; default view hides archived entries',async()=>{
 for(const isClc of [true,false]){const c=component();c.render({...props,isClc});c.states[0]=rows;let tree=c.render({...props,isClc});assert.match(text(tree),/Active message/);assert.ok(!text(tree).includes('Archived message'));const archive=nodes(tree).find(n=>n.type==='button'&&text(n)==='Archive');assert.equal(Boolean(archive),isClc);
 if(isClc){const filter=nodes(tree).find(n=>n.type==='select'&&n.props.value==='active');filter.props.onChange({target:{value:'archived'}});tree=c.render({...props,isClc});assert.match(text(tree),/Archived message/);assert.ok(!text(tree).includes('Active message'));nodes(tree).find(n=>n.type==='button'&&text(n)==='Restore').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.calls[0].action,'archive-request');assert.equal(c.calls[0].archived,false);}}
});

test('Archive All confirms the selected school and includes every active entry even while viewing Archived',async()=>{
 const c=component();c.render({...props,isClc:true});c.states[0]=[...rows,{id:'pending',kind:'lunch',status:'pending',note:'Pending trial'}];
 let tree=c.render({...props,isClc:true});nodes(tree).find(n=>n.type==='select'&&n.props.value==='active').props.onChange({target:{value:'archived'}});
 tree=c.render({...props,isClc:true});const all=nodes(tree).find(n=>n.type==='button'&&text(n)==='Archive All (2)');assert.ok(all);assert.equal(all.props.disabled,false);all.props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.match(c.prompts[0],/2 active notes and requests for School, including pending requests/);assert.equal(c.calls[0].action,'archive-all-requests');assert.deepEqual(Array.from(c.calls[0].ids),['a','pending']);
});
test('Archive All can be cancelled, is disabled for no active entries, and is absent for school admins',async()=>{
 const c=component(false);c.render({...props,isClc:true});c.states[0]=rows;nodes(c.render({...props,isClc:true})).find(n=>n.type==='button'&&text(n).startsWith('Archive All')).props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.calls.length,0);
 c.states[0]=[rows[1]];assert.equal(nodes(c.render({...props,isClc:true})).find(n=>n.type==='button'&&text(n)==='Archive All (0)').props.disabled,true);
 assert.ok(!nodes(c.render({...props,isClc:false})).some(n=>n.type==='button'&&text(n).startsWith('Archive All')));
});
