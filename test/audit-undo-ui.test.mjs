import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
import {auditSummary,auditValue,auditField} from '../frontend/src/auditPresentation.ts';
function component(){
 const source=ts.createSourceFile('AuditLog.tsx',fs.readFileSync(new URL('../frontend/src/AuditLog.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),node=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AuditLog');
 const code=ts.transpileModule(node.getText(source).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 let cursor=0;const states=[],calls=[];
 const context={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect(){},React:{createElement:(type,props,...children)=>({type,props:props||{},children})},auditSummary,auditValue,auditField,timestamp:v=>v,PageTitle:'Title',CollapsiblePanel:'Panel',DiscordAuditSettings:'Discord',DateField:'Date',UndoAuditPreview:'UndoPreview',pb:{send:async(_url,args)=>{calls.push(args.body);return args.body.action==='preview'?{id:'event',token:'reviewed',changes:{}}:{message:'Undo saved.'};}}};
 vm.runInNewContext(code,context);return {states,calls,render(props){cursor=0;return context.AuditLog(props);}};
}
function nodes(tree){const out=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){out.push(n);visit(n.children);}}visit(tree);return out;}
function text(n){return Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):n==null||n===false?'':String(n);}
const event={id:'event',entity_type:'students',entity_id:'kid',entity_label:'Killian',action:'update',daycare:'school',school_name:'School',occurred_at:'2026-10-15',changes:{service_days:{before:['Monday'],after:['Monday','Tuesday']}}};
test('Undo requires a preview and explicit confirmation, and school admins have no undo control',async()=>{
 let refreshed=0;const props={schools:[],selected:'all',isClc:true,onUndo:async()=>{refreshed++;}};const c=component();c.render(props);c.states[11]=[event];
 let tree=c.render(props);nodes(tree).find(n=>n.type==='button'&&text(n)==='Undo Change').props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.calls.length,1);assert.equal(c.calls[0].action,'preview');tree=c.render(props);const preview=nodes(tree).find(n=>n.type==='UndoPreview');assert.ok(preview);
 preview.props.onConfirm();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.calls[1].action,'apply');assert.equal(c.calls[1].token,'reviewed');assert.equal(refreshed,1);
 assert.ok(!text(c.render({...props,isClc:false})).includes('Undo Change'));
});
test('undone originals are labelled and undo receipts have readable summaries',()=>{
 const c=component(),props={schools:[],selected:'all',isClc:true};c.render(props);c.states[11]=[{...event,changes:{...event.changes,__undone:{at:'10-15-2026',by:'Joe'}}}];
 const tree=c.render(props);assert.ok(nodes(tree).some(n=>n.type==='button'&&text(n)==='Undone'&&n.props.disabled));assert.match(text(tree),/Undone 10-15-2026/);
 assert.equal(auditSummary({...event,changes:{__undo:{summary:'Undid student change for Killian'}}}),'Undid student change for Killian');
});

test('permanently deleted records do not offer an undo control',()=>{
 const c=component(),props={schools:[],selected:'all',isClc:true};c.render(props);c.states[11]=[{...event,action:'delete'}];assert.ok(!text(c.render(props)).includes('Undo Change'));
});
