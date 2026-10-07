const tracked=['students','classrooms','daycares','substitutions','menu_days','menu_items','users','lunch_requests','invoices','invoice_flags','school_notes'];
function snapshot(row){
  const type=row.collection().name;
  if(!tracked.includes(type))return {};
  const value=JSON.parse(JSON.stringify(row.publicExport()));
  const safe={};
  const userKeys=['email','display_name','role','daycare','active'];
  for(const key of Object.keys(value).sort()){
    if(['id','collectionId','collectionName','created','updated','expand'].includes(key)||/password|token|secret|credential/i.test(key))continue;
    if(type==='users'&&!userKeys.includes(key))continue;
    const raw=row.getString(key);
    if(['service_days','baseline_counts','clc_managed_counts','baseline_pizza_counts','lines','daily_counts'].includes(key)){try{safe[key]=JSON.parse(raw||'null');}catch(_){safe[key]=value[key];}}
    else safe[key]=value[key];
  }
  return safe;
}
function changes(before,after){const result={};for(const key of [...new Set([...Object.keys(before||{}),...Object.keys(after||{})])].sort()){const a=before?.[key]??null,b=after?.[key]??null;if(JSON.stringify(a)!==JSON.stringify(b))result[key]={before:a,after:b};}return result;}
function write(app,row,actor,action,before,after){
  if(!tracked.includes(row.collection().name))return;
  // Uploaded hooks may reload before the migration is activated by a restart.
  let collection;try{collection=app.findCollectionByNameOrId('audit_logs');}catch(_){return;}
  const diff=changes(before,after);if(action==='update'&&!Object.keys(diff).length)return;
  const type=row.collection().name,school=type==='daycares'?row.id:String(after?.daycare||before?.daycare||'');
  let schoolName='';if(school){try{schoolName=app.findRecordById('daycares',school).getString('name');}catch(_){schoolName=before?.name||school;}}
  const record=new Record(collection);
  const data={daycare:school,school_name:schoolName,actor_id:actor?.id||'',actor_name:actor?(actor.getString('display_name')||actor.getString('email')||'Administrator'):'System',actor_email:actor?.getString('email')||'',action,entity_type:type,entity_id:row.id,entity_label:after?.name||before?.name||after?.student_label||before?.student_label||after?.number||before?.number||after?.display_name||before?.display_name||after?.service_date||before?.service_date||row.id,occurred_at:new Date().toISOString(),effective_date:action==='delete'&&type==='students'?require(__hooks+'/billing-lib.js').addDays(require(__hooks+'/billing-lib.js').nyDate(),1):(after?.billing_effective_date||before?.billing_effective_date||''),changes:diff};
  for(const[k,v]of Object.entries(data))record.set(k,v);app.save(record);
}
function save(app,row,actor,options={}){const fresh=row.isNew(),before=fresh?{}:snapshot(row.original());app.save(row);const after=snapshot(row);if(options.credentialsChanged)after.account_access='Password updated';write(app,row,actor,fresh?'create':after.status==='deleted'&&before.status!=='deleted'?'delete':'update',before,after);}
function remove(app,row,actor){const before=snapshot(row);app.delete(row);write(app,row,actor,'delete',before,{});}
module.exports={snapshot,changes,write,save,remove};
