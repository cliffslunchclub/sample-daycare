function line(app,school,r){
 const lib=require(__hooks+'/billing-lib.js');
 const history=app.findRecordsByFilter('schedule_history','daycare = {:school}','effective_date',0,0,{school:school.id}).map(row=>({entity:row.getString('entity'),effective_date:row.getString('effective_date'),snapshot:JSON.parse(row.getString('snapshot')||'{}')}));
 const students=app.findRecordsByFilter('students','daycare = {:school}','',0,0,{school:school.id}).map(row=>({id:row.id,last_lunch_date:row.getString('last_lunch_date')}));
 const menus=app.findRecordsByFilter('menu_days','daycare = {:school}','',0,0,{school:school.id}).map(row=>({service_date:row.getString('service_date'),closed:row.getBool('closed')}));
 const day=lib.daily({public_slug:school.getString('public_slug')},lib.withDepartures(history,students),menus,r.getString('service_date'));
 const included=!day.closed&&!day.roster.some(k=>k.id===r.getString('student')||String(k.name||'').trim().toLowerCase()===r.getString('student_label').trim().toLowerCase());
 return {description:'One-off lunch: '+r.getString('student_label')+' ('+lib.displayDate(r.getString('service_date'))+')',quantity:included?1:0,rate:day.rate,taxable:true,request_id:r.id,request_student:r.getString('student'),request_label:r.getString('student_label'),service_dates:[r.getString('service_date')]};
}
function remove(app,r,school,actor,options={}){
 const lib=require(__hooks+'/billing-lib.js'),audit=require(__hooks+'/audit-lib.js');let issued=false;
 if(r.getString('invoice_id')){
  const invoice=app.findRecordById('invoices',r.getString('invoice_id'));
  if(invoice.getString('daycare')!==school.id)throw new Error('Invoice belongs to another school.');
  issued=['issued','closed'].includes(invoice.getString('status'));
  if(!issued){
   const lines=JSON.parse(invoice.getString('lines')||'[]').filter(l=>l.request_id!==r.id&&l.pending_request!==r.id);
   if(!lines.length)lines.push({description:'Adjustment',quantity:0,rate:school.getFloat('invoice_rate'),taxable:true});
   const sum=lib.totals(lines);for(const key of Object.keys(sum))invoice.set(key,sum[key]);
   const description='One-off lunch: '+r.getString('student_label')+' ('+lib.displayDate(r.getString('service_date'))+')';
   invoice.set('generated_notes',invoice.getString('generated_notes').split('\n').filter(l=>!l.startsWith(description+':')).join('\n'));
   require(__hooks+'/invoice-adjustments.js').notes(invoice);audit.save(app,invoice,actor);r.set('invoice_id','');
  }
 }
 r.set('status','deleted');if(options.silent)app.save(r);else audit.save(app,r,actor);return issued;
}
function approve(app,r,school,actor,options={}){
 if(r.getString('daycare')!==school.id||r.getString('kind')!=='lunch'||r.getString('status')!=='pending')throw new Error('Only pending lunch requests in this school can be approved.');
 const adjustment=line(app,school,r);
 if(!adjustment.quantity)throw new Error('Review '+r.getString('student_label')+' on '+require(__hooks+'/billing-lib.js').displayDate(r.getString('service_date'))+': no lunch service or the student is already scheduled. No requests were approved.');
 const date=r.getString('service_date');
 const duplicate=app.findRecordsByFilter('lunch_requests','daycare = {:school} && kind = "lunch" && status = "approved" && service_date = {:date} && id != {:id}','',0,0,{school:school.id,date,id:r.id}).some(other=>(r.getString('student')&&other.getString('student')===r.getString('student'))||other.getString('student_label').trim().toLowerCase()===r.getString('student_label').trim().toLowerCase());
 if(duplicate)throw new Error('An approved lunch already exists for this student and date. No requests were approved.');
 const closedPeriod=require(__hooks+'/invoice-adjustments.js').closedDate(app,school,date);
 const drafts=closedPeriod?[]:app.findRecordsByFilter('invoices','daycare = {:school} && status = "draft"','',0,0,{school:school.id}).filter(i=>i.getString('billing_cycle')==='biweekly'?i.getString('period_start')<=date&&i.getString('period_end')>=date:i.getString('month')===date.slice(0,7));
 if(drafts.length>1)throw new Error('More than one draft invoice covers this date. Review the invoices before approving.');
 if(drafts.length===1){
  const invoice=drafts[0],lines=JSON.parse(invoice.getString('lines')||'[]');
  if(!lines.some(l=>l.request_id===r.id))lines.push(adjustment);
  const sum=require(__hooks+'/billing-lib.js').totals(lines);for(const key of Object.keys(sum))invoice.set(key,sum[key]);
  invoice.set('generated_notes',invoice.getString('generated_notes')+'\n'+adjustment.description+': +1 meal.');require(__hooks+'/audit-lib.js').save(app,invoice,actor);r.set('invoice_id',invoice.id);
 }
 r.set('billing_deferred',false);r.set('status','approved');if(options.silent)app.save(r);else require(__hooks+'/audit-lib.js').save(app,r,actor);
}
module.exports={line,remove,approve};
