import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
import {schoolToday,pastStudent,inRoster,studentScheduled} from '../frontend/src/studentLifecycle.ts';
function renderFunction(file,name,extras={}){
 const source=ts.createSourceFile('component.tsx',readFileSync(new URL('../frontend/src/'+file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const declaration=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
 const code=ts.transpileModule(declaration.getText(source).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 let cursor=0;const states=[];
 const context={schoolToday,pastStudent,inRoster,studentScheduled,DateField:'DateField',CollapsiblePanel:'Panel',StudentEditor:'Editor',Empty:'Empty',weekdays:['Monday','Tuesday','Wednesday','Thursday','Friday'],useEffect(){},useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},React:{createElement:(type,props,...children)=>({type,props:props||{},children})},rosterRows:()=>[],invoiceDate:s=>s,shortStudentName:s=>s,titleCase:s=>s,...extras};
 vm.runInNewContext(code,context);
 return {states,render(props){cursor=0;return context[name](props);}};
}
function nodes(tree){const result=[];function visit(node){if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){result.push(node);visit(node.children);}}visit(tree);return result;}
function text(node){return Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.children):node==null||node===false?'':String(node);}
const props={current:{id:'school',sizes_enabled:false},students:[{id:'a',daycare:'school',classroom:'room',active:true,name:'Active Student',service_days:['Friday']},{id:'p',daycare:'school',classroom:'room',active:true,name:'Past Student',last_lunch_date:'2020-10-30',service_days:['Friday']}],classrooms:[{id:'room',daycare:'school',name:'Classroom',active:true}],subs:[],onRefresh:async()=>{},error(){}};
test('both roster views default to active, expose past/all filters, and reserve deletion for CLC',()=>{
 for(const isClc of [true,false]){
  const component=renderFunction('App.tsx','StudentsPage');let tree=component.render({...props,isClc});let list=nodes(tree);
  const rowNames=()=>list.filter(n=>n.type==='tr'&&n.props.key).map(text).join(' ');
  assert.match(rowNames(),/Active Student/);assert.doesNotMatch(rowNames(),/Past Student/);
  assert.equal(text(tree).includes('Permanently Delete'),isClc);
  assert.match(text(tree),/Archive Student/);
  list.find(n=>n.type==='select'&&n.props['aria-label']==='Roster status').props.onChange({target:{value:'past'}});
  list=nodes(component.render({...props,isClc}));assert.match(rowNames(),/Past Student/);assert.doesNotMatch(rowNames(),/Active Student/);
  list.find(n=>n.type==='select'&&n.props['aria-label']==='Roster status').props.onChange({target:{value:'all'}});
  list=nodes(component.render({...props,isClc}));assert.match(rowNames(),/Past Student/);assert.match(rowNames(),/Active Student/);
 }
});
test('Approve All is CLC-only, counts pending lunches, and confirms the selected school',async()=>{
 const calls=[],confirmations=[];
 const component=renderFunction('Billing.tsx','NotesRequests',{window:{confirm:message=>{confirmations.push(message);return true;}},api:async(school,body)=>{calls.push({school,body});return {message:'Approved'};},pb:{filter:()=>'',collection:()=>({getFullList:async()=>[]})}});
 const school={id:'school',name:'QA School'};
 component.render({school,isClc:true,students:[],classrooms:[]});
 component.states[0]=[{id:'pending',kind:'lunch',status:'pending',service_date:'2026-10-16'},{id:'approved',kind:'lunch',status:'approved',service_date:'2026-10-16'},{id:'note',kind:'note',status:'new'}];
 const props={school,students:[],classrooms:[]};
 const tree=component.render({...props,isClc:true});const button=nodes(tree).find(n=>n.type==='button'&&text(n).startsWith('Approve All'));
 assert.equal(text(button),'Approve All (1)');button.props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.match(confirmations[0],/1 pending.*QA School/);assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{school:'school',body:{action:'approve-all-requests',ids:['pending']}});
 assert.ok(!text(component.render({...props,isClc:false})).includes('Approve All'));
});
