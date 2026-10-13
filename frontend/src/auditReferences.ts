import { auditRelations, type AuditReferences } from './auditPresentation';
type Row=Record<string,any>;
export async function loadAuditReferences(pb:any,rows:Row[],schools:Row[]):Promise<AuditReferences>{
 const refs:AuditReferences={};for(const school of schools)refs[`daycares:${school.id}`]=school;
 const needed:Record<string,Set<string>>={};
 const add=(table:string,id:any)=>{if(/^[a-z0-9]{15}$/.test(String(id||'')))(needed[table] ||=new Set()).add(String(id));};
 for(const row of rows){
  for(const [key,change] of Object.entries(row.changes||{})){const relation=auditRelations[key];if(!relation)continue;for(const side of ['before','after']){const item=change as Row;if(!item[side+'_label'])add(relation,item[side]);}}
  if(!row.changes?.__display && ['substitutions','menu_days','lunch_requests'].includes(row.entity_type))add(row.entity_type,row.entity_id);
 }
 const fetchLive=async()=>{await Promise.all(Object.entries(needed).map(async([table,ids])=>{
  const missing=[...ids].filter(id=>!refs[`${table}:${id}`]);if(!missing.length)return;
  try{const found=await pb.collection(table).getFullList({filter:missing.map(id=>pb.filter('id = {:id}',{id})).join(' || '),requestKey:null});for(const row of found)refs[`${table}:${row.id}`]=row;}catch{/* Unavailable references must not prevent the log from loading. */}
 }));};
 await fetchLive();
 // Deleted records can still be named from their own, access-controlled audit history.
 await Promise.all(Object.entries(needed).map(async([table,ids])=>{
  const missing=[...ids].filter(id=>!refs[`${table}:${id}`]);if(!missing.length)return;
  try{
   const history=await pb.collection('audit_logs').getList(1,500,{sort:'-occurred_at,-id',filter:pb.filter('entity_type = {:type}',{type:table})+' && ('+missing.map(id=>pb.filter('entity_id = {:id}',{id})).join(' || ')+')',requestKey:null});
   for(const log of history.items){
    const key=`${table}:${log.entity_id}:${log.daycare}`,values:Row={};
    for(const [field,change]of Object.entries(log.changes||{})){if(field.startsWith('__'))continue;const item=change as Row;values[field]=item.after??item.before;}
    const side=log.action==='delete'?'before':'after';
    const name=log.changes?.__display?.[side]?.subject||values.name||values.display_name||(log.entity_label!==log.entity_id&&!/^\d{4}-\d{2}/.test(log.entity_label||'')?log.entity_label:'');
    refs[key]={id:log.entity_id,daycare:log.daycare,...values,...refs[key],...(name&&!refs[key]?.name?{name}:{})};
   }
  }catch{}
 }));
 for(const [key,row]of Object.entries(refs))if(key.startsWith('substitutions:')||key.startsWith('lunch_requests:')){add('students',row.student);add('classrooms',row.classroom);}
 await fetchLive();
 // A second lookup covers students referenced by legacy substitution records.
 const ids=[...(needed.students||[])].filter(id=>!refs[`students:${id}`]&&!Object.keys(refs).some(key=>key.startsWith(`students:${id}:`)));
 if(ids.length)try{
  const history=await pb.collection('audit_logs').getList(1,500,{sort:'-occurred_at,-id',filter:pb.filter('entity_type = {:type}',{type:'students'})+' && ('+ids.map(id=>pb.filter('entity_id = {:id}',{id})).join(' || ')+')',requestKey:null});
  for(const row of history.items){const key=`students:${row.entity_id}:${row.daycare}`;if(!refs[key])refs[key]={id:row.entity_id,daycare:row.daycare,name:row.changes?.__display?.[row.action==='delete'?'before':'after']?.subject||row.changes?.name?.after||row.changes?.name?.before||row.entity_label};}
 }catch{}
 return refs;
}
