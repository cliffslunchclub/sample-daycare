routerAdd('GET','/api/student-lifecycle',e=>{
 if(!e.auth||!e.auth.getBool('active')||!['clc_admin','daycare_admin'].includes(e.auth.getString('role')))return e.json(403,{message:'Administrator access is required.'});
 require(__hooks+'/student-lifecycle.js').ensure(e.app);return e.json(200,{ready:true});
});
routerAdd('POST','/api/student-lifecycle',e=>{
 if(!e.auth||!e.auth.getBool('active')||!['clc_admin','daycare_admin'].includes(e.auth.getString('role')))return e.json(403,{message:'Administrator access is required.'});
 try{return e.json(200,require(__hooks+'/student-lifecycle.js').run(e.app,e.auth,e.requestInfo().body||{}));}catch(err){return e.json(400,{message:String(err.message||err)});}
});
// Enforce the archive policy even before the schema setup/migration has run.
onRecordDeleteRequest(e=>{if(!e.auth||!e.auth.getBool('active')||e.auth.getString('role')!=='clc_admin')throw new ForbiddenError('Only CLC admins can permanently delete students. Archive the student instead.');e.next();},'students');
onRecordValidate(e=>{const date=e.record.getString('last_lunch_date');if(date&&!require(__hooks+'/billing-lib.js').validDate(date))throw new BadRequestError('Choose a valid last lunch date.');e.next();},'students');
// The departure limit applies across saved schedule versions. Keep it in each
// snapshot too, so the limit survives even a later permanent deletion.
onRecordUpdate(e=>{
 const before=e.record.original().getString('last_lunch_date'),after=e.record.getString('last_lunch_date');
 if(before===after)return e.next();
 e.app.runInTransaction(tx=>{
  e.app=tx;e.next();
  for(const row of tx.findRecordsByFilter('schedule_history','daycare = {:school} && entity = {:student}','',0,0,{school:e.record.getString('daycare'),student:e.record.id})){
   const snapshot=JSON.parse(row.getString('snapshot')||'{}');snapshot.last_lunch_date=after;row.set('snapshot',snapshot);tx.save(row);
  }
 });
},'students');
