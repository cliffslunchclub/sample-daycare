const allowed={students:['name','classroom','active','service_days','size','billing_effective_date','last_lunch_date'],classrooms:['name','meal_size','active','age_order'],substitutions:['student','service_date','weekday','code','recurring','pizza_substitution','note'],menu_days:['service_date','menu','menu_item','note','closed','published','pizza_count'],menu_items:['name','active'],lunch_requests:['kind','student','student_label','classroom_label','service_date','size','code','note','status','response','invoice_id','created_by','archived','billing_deferred'],school_notes:['note','message','status','response']};
const scheduleKeys=['active','service_days','billing_effective_date','last_lunch_date'];
function authorize(actor){if(!actor||!actor.getBool('active')||actor.getString('role')!=='clc_admin')throw new Error('Only CLC superadmins can undo audit changes.');}
function plan(app,actor,id){
 authorize(actor);
 const audit=require(__hooks+'/audit-lib.js'),state=require(__hooks+'/audit-undo-state.js'),billing=require(__hooks+'/billing-lib.js');
 const source=app.findRecordById('audit_logs',String(id||'')),type=source.getString('entity_type'),action=source.getString('action'),changes=JSON.parse(source.getString('changes')||'{}');
 if(!allowed[type])throw new Error('Undo is not available for accounts, passwords, invoices, or school settings.');
 if(changes.__undo)throw new Error('An undo entry cannot itself be undone. Make a new edit instead.');
 if(changes.__undone)throw new Error('This change has already been undone.');
 let row;try{row=app.findRecordById(type,source.getString('entity_id'));}catch(_){throw new Error('This record was permanently deleted. Permanent deletions cannot be undone.');}
 const schoolId=row.getString('daycare');if(schoolId!==source.getString('daycare'))throw new Error('The record no longer belongs to the original school.');
 if(action==='delete'&&!(type==='lunch_requests'&&changes.status?.after==='deleted'))throw new Error('Permanent deletions cannot be undone.');
 if(!['create','update','delete'].includes(action))throw new Error('This audit entry cannot be undone.');
 const later=app.findRecordsByFilter('audit_logs','entity_type = {:type} && entity_id = {:id} && occurred_at >= {:date} && id != {:audit}','',0,0,{type,id:row.id,date:source.getString('occurred_at'),audit:source.id});
 if(later.some(log=>{const c=JSON.parse(log.getString('changes')||'{}');const fields=Object.keys(c).filter(k=>!k.startsWith('__'));const billingOnly=type==='lunch_requests'&&fields.length===1&&fields[0]==='invoice_id';return !c.__undo&&!c.__undone&&!billingOnly;}))throw new Error('A newer change exists for this record. Undo the later change first.');
 const current=audit.snapshot(row),keys=Object.keys(changes).filter(k=>!k.startsWith('__'));
 const billingUndo=type==='lunch_requests'&&action==='update'&&keys.length===1&&keys[0]==='invoice_id';
 if(billingUndo){
  if(current.kind!=='lunch'||current.status!=='approved'||!current.invoice_id||current.invoice_id!==changes.invoice_id.after)throw new Error('This lunch billing assignment is no longer current. Review the latest request and invoice first.');
  if(changes.invoice_id.before)throw new Error('This entry moved an existing invoice assignment. Review the original invoice before making a billing correction.');
  const assigned=app.findRecordById('invoices',current.invoice_id);if(assigned.getString('daycare')!==schoolId)throw new Error('Invoice belongs to another school.');
 }
 for(const k of keys){if(type==='lunch_requests'&&k==='invoice_id')continue;if(!state.same(current[k]??null,changes[k].after??null))throw new Error('This record no longer matches the saved change. Refresh and review newer activity first.');}
 const effective=String(changes.billing_effective_date?.after||(type==='students'&&keys.some(k=>scheduleKeys.includes(k)&&k!=='last_lunch_date')?current.billing_effective_date:'')||source.getString('effective_date')||current.billing_effective_date||'');
 let mode='update',restore={...current};
 if(action==='create'){
  if(type==='students'){restore.active=false;restore.billing_effective_date=effective;}
  else if(type==='classrooms'){
   if(app.findRecordsByFilter('students','classroom = {:room}','',1,0,{room:row.id}).length)throw new Error('This classroom now contains students. Move its retained students to another classroom before undoing its creation.');
   restore.active=false;
  }else if(type==='lunch_requests')restore.status='deleted';
  else mode='remove';
  if(type==='menu_items'&&app.findRecordsByFilter('menu_days','menu_item = {:item}','',1,0,{item:row.id}).length)throw new Error('This menu item is used by a saved menu. Remove or change those selections before undoing its creation.');
 }else{
  if(keys.some(k=>!allowed[type].includes(k)))throw new Error('This older entry contains fields that cannot be restored safely.');
  for(const k of keys)restore[k]=changes[k].before;
  // Returning the request to Pending also prevents invoice regeneration from
  // silently billing the same approved lunch again. Closed references remain
  // immutable and the pending-adjustment ledger supplies the matching credit.
  if(billingUndo){restore.status='pending';restore.invoice_id='';}
  if(type==='students'&&keys.some(k=>scheduleKeys.includes(k)&&k!=='last_lunch_date')){
   if(!billing.validDate(effective))throw new Error('The original schedule effective date is unavailable. Edit this student directly.');
   // Restore the old schedule FROM the original change's date, rather than
   // rewriting the student's earlier baseline to the old form field value.
   restore.billing_effective_date=effective;
  }
 }
 if(type==='students'&&changes.__schedule?.before){const prior=changes.__schedule.before.subjects.find(s=>s.id===row.id);if(prior)for(const key of allowed.students)if(Object.prototype.hasOwnProperty.call(prior.record,key))restore[key]=prior.record[key];}
 if(type==='students'){
  if((action==='create'||keys.some(k=>scheduleKeys.includes(k)&&k!=='last_lunch_date'))&&!billing.validDate(effective))throw new Error('A valid original effective date is required.');
  const room=app.findRecordById('classrooms',String(restore.classroom||''));if(room.getString('daycare')!==schoolId)throw new Error('The original classroom is no longer available in this school.');
  const school=app.findRecordById('daycares',schoolId),size=school.getBool('sizes_enabled')?room.getString('meal_size'):'standard';
  if(restore.size&&restore.size!==size)throw new Error('Meal size is controlled by the classroom. Undo the related classroom change first.');
  if(restore.active&&!room.getBool('active'))throw new Error('The original classroom is inactive. Restore the classroom first.');
  if(!changes.__schedule&&keys.includes('billing_effective_date')&&!keys.some(k=>['active','service_days','size','classroom'].includes(k)))throw new Error('This older date-only change does not preserve enough schedule history for a safe undo. Edit the effective date directly.');
 }
 if(type==='classrooms'&&keys.includes('meal_size')&&!changes.__schedule)throw new Error('This older classroom size change does not preserve its related student history. Edit the classroom size directly.');
 const scheduleRestore=Boolean(changes.__schedule&&(type==='students'||type==='classrooms'&&keys.includes('meal_size')));
 if(scheduleRestore)state.validate(app,row,changes.__schedule.after);
 else if(type==='students'&&keys.some(k=>scheduleKeys.includes(k)&&k!=='last_lunch_date')){
  const future=app.findRecordsByFilter('schedule_history','daycare = {:school} && entity = {:id} && effective_date > {:date}','',1,0,{school:schoolId,id:row.id,date:effective});
  if(future.length)throw new Error('Later schedule versions exist. This older entry cannot be undone safely; review the later changes first.');
 }
 if(type==='substitutions'){
  const student=app.findRecordById('students',String(restore.student||''));if(student.getString('daycare')!==schoolId)throw new Error('The original student is unavailable in this school.');
  if(mode!=='remove'&&restore.recurring&&app.findRecordsByFilter('substitutions','student = {:student} && weekday = {:weekday} && recurring = true && id != {:id}','',1,0,{student:restore.student,weekday:restore.weekday,id:row.id}).length)throw new Error('Another substitution now occupies the original student and weekday.');
 }
 if(type==='menu_days'&&mode!=='remove'&&keys.includes('service_date')&&app.findRecordsByFilter('menu_days','daycare = {:school} && service_date = {:date} && id != {:id}','',1,0,{school:schoolId,date:restore.service_date,id:row.id}).length)throw new Error('Another menu now occupies the original date.');
 let school=null;if(schoolId)school=app.findRecordById('daycares',schoolId);
 const requestChange=type==='lunch_requests'&&restore.kind==='lunch'&&(billingUndo||action==='create'||keys.some(k=>['status','student','student_label','service_date','size','code','billing_deferred'].includes(k)));
 if(requestChange&&(restore.status!=='approved'||restore.billing_deferred))restore.invoice_id='';
 if(requestChange&&restore.status==='approved'&&!restore.billing_deferred){
  const ops=require(__hooks+'/invoice-adjustments.js'),d=ops.data(app,school),day=billing.daily(d.school,d.history,d.menus,restore.service_date);
  if(day.closed||day.roster.some(s=>s.id===restore.student||String(s.name||'').trim().toLowerCase()===String(restore.student_label||'').trim().toLowerCase()))throw new Error('This lunch cannot be restored: no lunch service or the student is already scheduled.');
  if(d.requests.some(r=>r.id!==row.id&&r.kind==='lunch'&&r.status==='approved'&&r.service_date===restore.service_date&&((restore.student&&r.student===restore.student)||String(r.student_label||'').trim().toLowerCase()===String(restore.student_label||'').trim().toLowerCase())))throw new Error('An approved lunch already exists for this student and date.');
  const priorInvoice=d.invoices.find(i=>i.id===restore.invoice_id&&i.status!=='draft');
  if(!priorInvoice){const drafts=ops.closedDate(app,school,restore.service_date)?[]:d.invoices.filter(i=>i.status==='draft'&&(i.billing_cycle==='biweekly'?i.period_start<=restore.service_date&&i.period_end>=restore.service_date:i.month===restore.service_date.slice(0,7)));if(drafts.length>1)throw new Error('More than one draft covers this lunch date. Review the invoices before undoing.');restore.invoice_id=drafts[0]?.id||'';}

 }
 const schedule=state.capture(app,row),financial=school?require(__hooks+'/invoice-adjustments.js').currentValues(app,school):{};
 const invoices=school?app.findRecordsByFilter('invoices','daycare = {:school}','id',0,0,{school:schoolId}).map(r=>({id:r.id,status:r.getString('status'),lines:r.getString('lines')})):[];
 const token=JSON.stringify({source:source.id,changes,current,schedule,financial,invoices});
 const previewChanges=audit.changes(current,mode==='remove'?{}:restore);require(__hooks+'/audit-display.js').decorate(app,type,schoolId,school?.getString('name')||'',current,mode==='remove'?{}:restore,previewChanges);
 let label=current.name||current.student_label||changes.__display?.after?.subject||changes.__display?.before?.subject||source.getString('entity_label');
 if(type==='menu_days')label='Lunch Menu for '+billing.displayDate(String(current.service_date||'').slice(0,10));
 if(type==='substitutions'){try{label=app.findRecordById('students',current.student).getString('name')+' · '+(current.weekday||'Substitution');}catch(_){label='Substitution';}}
 if(!label||label===row.id)label=type==='lunch_requests'&&current.kind==='note'?'General Note':type==='school_notes'?'School Note':'School Record';
 const summary=billingUndo?'Undid lunch billing for '+label:'Undid '+({students:'student change',classrooms:'classroom change',substitutions:'substitution change',menu_days:'menu change',menu_items:'menu item change',lunch_requests:'note / lunch request change',school_notes:'school note change'}[type])+(label&&label!==row.id?' for '+label:'');
 return {source,row,type,action,changes,current,restore,mode,effective,school,requestChange,scheduleRestore,financial,token,preview:{id:source.id,token,label,summary,entity_type:type,daycare:schoolId,changes:previewChanges,effective_date:type==='students'?effective:'',removes_record:mode==='remove',archives_student:type==='students'&&action==='create',message:billingUndo?'The lunch request will return to Pending. Its charge will be removed from editable drafts. If already billed on a closed invoice, a pending credit will be available instead. Approve the request again only if you want to bill it again.':'Closed invoices stay frozen. Changed pending adjustments are recalculated; related adjustment lines on editable drafts are removed and returned for review.'}};
}
function run(app,actor,body){
 authorize(actor);let result;
 app.runInTransaction(tx=>{
  const p=plan(tx,actor,body.id);if(body.action==='preview'){result=p.preview;return;}
  if(body.action!=='apply'||String(body.token||'')!==p.token)throw new Error('The record or billing data changed since the preview. Preview this undo again. Nothing was changed.');
  const audit=require(__hooks+'/audit-lib.js'),state=require(__hooks+'/audit-undo-state.js'),scheduleBefore=state.capture(tx,p.row);
  if(p.type==='lunch_requests'&&p.requestChange){
   const requests=require(__hooks+'/lunch-request-lib.js');
   if(p.row.getString('kind')==='lunch'&&(p.row.getString('status')==='approved'||p.row.getString('invoice_id')))requests.remove(tx,p.row,p.school,actor,{silent:true});
   for(const key of allowed[p.type])if(Object.prototype.hasOwnProperty.call(p.restore,key))p.row.set(key,p.restore[key]);
   if(p.restore.status==='approved'&&!p.restore.billing_deferred){
    // An existing frozen assignment is a billed reference, not a draft to edit.
    let frozen=false;if(p.restore.invoice_id){try{const i=tx.findRecordById('invoices',p.restore.invoice_id);frozen=i.getString('daycare')===p.school.id&&i.getString('status')!=='draft';}catch(_){}}
    if(frozen)tx.save(p.row);else{p.row.set('status','pending');p.row.set('invoice_id','');requests.approve(tx,p.row,p.school,actor,{silent:true});}
   }else tx.save(p.row);
  }else if(p.mode==='remove')tx.delete(p.row);
  else{
   for(const key of allowed[p.type])if(Object.prototype.hasOwnProperty.call(p.restore,key))p.row.set(key,p.restore[key]);
   tx.save(p.row);
  }
  if(p.scheduleRestore){
   // Classroom size hooks also update student records. Restore the exact child
   // records before restoring their version history captured with the source.
   if(p.type==='classrooms')for(const saved of p.changes.__schedule.before?.subjects||[]){const child=tx.findRecordById('students',saved.id);for(const [key,value]of Object.entries(saved.record))child.set(key,value);tx.save(child);}
   state.restore(tx,p.changes.__schedule.before,p.changes.__schedule.after);
  }
  const removed=p.school?require(__hooks+'/invoice-adjustments.js').resetUndoDrafts(tx,p.school,p.financial,actor):0;
  const after=p.mode==='remove'?{}:audit.snapshot(p.row),now=new Date().toISOString();
  const receipt=audit.write(tx,p.row,actor,p.mode==='remove'?'delete':'update',p.current,after,{effective_date:p.type==='students'?p.effective:'',undo:{source_id:p.source.id,source_action:p.action,summary:p.preview.summary,at:now},schedule:{before:scheduleBefore,after:p.mode==='remove'?null:state.capture(tx,p.row)}});
  p.changes.__undone={receipt_id:receipt.id,at:now,by:actor.getString('display_name')||actor.getString('email')};p.source.set('changes',p.changes);tx.save(p.source);
  result={undone:true,removed_draft_adjustments:removed,message:'Undo saved. Pending invoice differences were recalculated.'+(removed?' '+removed+' related adjustment lines were removed from editable drafts for review.':'')+' Closed invoice amounts are unchanged.'};
 });return result;
}
module.exports={allowed,authorize,plan,run};
