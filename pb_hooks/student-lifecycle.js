// The protected setup route applies this small additive schema change on hosts
// that hot-reload hooks without automatically running newly uploaded migrations.
function ensure(app) {
  app.runInTransaction(tx => {
    const c=tx.findCollectionByNameOrId('students');let changed=false;
    if(!c.fields.getByName('last_lunch_date')){c.fields.add(new TextField({name:'last_lunch_date',max:10}));changed=true;}
    const rule='@request.auth.active = true && @request.auth.role = "clc_admin"';
    if(c.deleteRule!==rule){c.deleteRule=rule;changed=true;}
    if(changed)tx.save(c);
  });
}
function authorize(app,actor,schoolId){
  if(!actor||!actor.getBool('active')||!['clc_admin','daycare_admin'].includes(actor.getString('role')))throw new Error('Please sign in as an administrator.');
  const clc=actor.getString('role')==='clc_admin';
  if(!clc&&actor.getString('daycare')!==schoolId)throw new Error('School access is required.');
  const school=app.findRecordById('daycares',schoolId);
  if(!clc&&!school.getBool('operations_enabled'))throw new Error('School roster tools are disabled.');
  return school;
}
function futureRequests(app,school,ids,date){
  return app.findRecordsByFilter('lunch_requests','daycare = {:school} && kind = "lunch" && service_date > {:date} && (status = "pending" || status = "approved")','service_date',0,0,{school,date}).filter(r=>ids.includes(r.getString('student')));
}
function run(app,actor,body){
  const lib=require(__hooks+'/billing-lib.js'),schoolId=String(body.daycare||''),action=String(body.action||'');
  authorize(app,actor,schoolId);ensure(app);
  let result;
  app.runInTransaction(tx=>{
    const school=authorize(tx,actor,schoolId),audit=require(__hooks+'/audit-lib.js');
    const ids=action==='save'?(body.id?[String(body.id)]:[]):Array.isArray(body.students)?[...new Set(body.students.map(String))]:[];
    if(ids.length>500||(!ids.length&&action!=='save'))throw new Error('Choose between 1 and 500 students.');
    const rows=ids.map(id=>tx.findRecordById('students',id));
    if(rows.some(r=>r.getString('daycare')!==schoolId))throw new Error('Every student must belong to this school.');
    const date=String(body.last_lunch_date||'');
    if((date&&!lib.validDate(date))||((action==='archive'||action==='preview')&&!date))throw new Error('Choose a valid last lunch date.');
    const requests=date?futureRequests(tx,schoolId,ids,date):[];
    if(action==='preview'){result={requests:requests.map(r=>({id:r.id,student_label:r.getString('student_label'),service_date:r.getString('service_date')}))};return;}
    if(!['save','archive'].includes(action))throw new Error('Unknown action.');
    if(requests.length){
      if(typeof body.delete_future_requests!=='boolean')throw new Error('Review whether to delete the later one-off requests before saving.');
      const reviewed=Array.isArray(body.reviewed_requests)?body.reviewed_requests.map(String):[];
      if(requests.some(r=>!reviewed.includes(r.id)))throw new Error('New one-off requests were added. Review the later requests and save again. No changes were saved.');
    }
    if(action==='save'){
      const row=rows[0]||new Record(tx.findCollectionByNameOrId('students'));
      const effective=String(body.billing_effective_date||'');
      if(!lib.validDate(effective))throw new Error('Choose a valid schedule effective date.');
      const room=tx.findRecordById('classrooms',String(body.classroom||''));
      if(room.getString('daycare')!==schoolId||!room.getBool('active'))throw new Error('Choose an active classroom in this school.');
      const days=body.service_days;
      if(!Array.isArray(days)||days.some(d=>!lib.weekdays.slice(1,6).includes(d)))throw new Error('Choose valid weekly lunch days.');
      const name=String(body.name||'').trim();if(!name||name.length>150)throw new Error('Enter a student name of up to 150 characters.');
      for(const [key,value]of Object.entries({daycare:schoolId,name,classroom:room.id,active:body.active!==false,service_days:[...new Set(days)],billing_effective_date:effective,last_lunch_date:date}))row.set(key,value);
      audit.save(tx,row,actor);result={saved:1};
    }else{
      for(const row of rows){row.set('last_lunch_date',date);audit.save(tx,row,actor);}
      result={saved:rows.length};
    }
    let issued=0;
    if(body.delete_future_requests===true)for(const r of requests){if(require(__hooks+'/lunch-request-lib.js').remove(tx,r,school,actor))issued++;}
    result.deleted_requests=body.delete_future_requests===true?requests.length:0;
    result.message=(action==='archive'?'Last lunch date saved for '+rows.length+' student'+(rows.length===1?'':'s')+'.':'Student saved.')+(result.deleted_requests?' '+result.deleted_requests+' later one-off requests deleted.':'')+(issued?' Issued invoices are unchanged; review them for credit adjustments.':'');
  });
  return result;
}
module.exports={ensure,authorize,futureRequests,run};
