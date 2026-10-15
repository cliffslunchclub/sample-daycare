const fields=['name','daycare','classroom','active','service_days','size','billing_effective_date','last_lunch_date'];
function student(app,id){
 let row;try{row=app.findRecordById('students',id);}catch(_){return null;}
 const record={};for(const key of fields){record[key]=key==='service_days'?JSON.parse(row.getString(key)||'[]'):key==='active'?row.getBool(key):row.getString(key);}
 const history=app.findRecordsByFilter('schedule_history','daycare = {:school} && entity = {:id}','effective_date,id',0,0,{school:row.getString('daycare'),id}).map(r=>({id:r.id,effective_date:r.getString('effective_date'),snapshot:JSON.parse(r.getString('snapshot')||'{}')}));
 return {id,daycare:row.getString('daycare'),record,history};
}
function capture(app,row){
 const type=row.collection().name;if(!['students','classrooms'].includes(type))return null;
 const ids=type==='students'?[row.id]:app.findRecordsByFilter('students','classroom = {:room}','id',0,0,{room:row.id}).map(r=>r.id);
 return {version:1,subjects:ids.map(id=>student(app,id)).filter(Boolean).sort((a,b)=>a.id.localeCompare(b.id))};
}
function same(a,b){const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function validate(app,row,saved){if(saved&&!same(capture(app,row),saved))throw new Error('Schedule history or a related student changed after this entry. Undo the later change first.');}
function restore(app,state,after){
 const ids=[...new Set([...(state?.subjects||[]).map(s=>s.id),...(after?.subjects||[]).map(s=>s.id)])];
 for(const id of ids){
  const before=state?.subjects.find(s=>s.id===id),post=after?.subjects.find(s=>s.id===id),school=before?.daycare||post?.daycare;
  const saved=before?.history||[],existing=app.findRecordsByFilter('schedule_history','daycare = {:school} && entity = {:id}','',0,0,{school,id});
  for(const row of existing)if(!saved.some(s=>s.id===row.id))app.delete(row);
  for(const version of saved){let row=existing.find(r=>r.id===version.id);if(!row){row=new Record(app.findCollectionByNameOrId('schedule_history'));row.set('id',version.id);}row.set('daycare',school);row.set('entity',id);row.set('effective_date',version.effective_date);row.set('snapshot',version.snapshot);app.save(row);}
 }
}
module.exports={capture,student,same,validate,restore};
