// Move the Bergenfield roster release effective date from Friday Nov 13 to
// Thursday Nov 12, 2026. The prior roster migration may already be recorded as
// applied, so this is a NEW corrective migration rather than a modification of
// the historical file. Past service through Nov 11 remains unchanged.
const from='2026-11-13';
const effective='2026-11-12';
const previous='2026-11-11';

migrate(app=>{
  const schools=app.findRecordsByFilter('daycares','public_slug = {:slug}','',1,0,{slug:'lightbridge-bergenfield'});
  if(!schools.length)return;
  const school=schools[0];
  if(school.getString('count_mode')!=='roster')throw new Error('Bergenfield must use roster count mode.');
  const students=app.findRecordsByFilter('students','daycare = {:school}','',0,0,{school:school.id});
  const byId=new Map(students.map(row=>[row.id,row]));
  const snapshots=app.findRecordsByFilter('schedule_history',
    'daycare = {:school} && effective_date = {:date} && entity != "school"',
    '',0,0,{school:school.id,date:from});
  const historyCollection=app.findCollectionByNameOrId('schedule_history');

  for(const future of snapshots){
    const student=byId.get(future.getString('entity'));
    if(!student||student.getString('billing_effective_date')!==from)continue;

    const snapshot=JSON.parse(future.getString('snapshot')||'{}');
    const currentDays=JSON.parse(student.getString('service_days')||'[]');
    if(JSON.stringify(snapshot.service_days||[])!==JSON.stringify(currentDays))continue;
    // Only shift the snapshot from the approved Bergenfield roster import.
    // Do not alter later, independently scheduled changes.
    if(snapshot.classroom!==student.getString('classroom')||
       snapshot.name!==student.getString('name'))continue;

    // Students removed from the roster now end after Nov 11 rather than Nov 12.
    if(!currentDays.length&&student.getString('last_lunch_date')===effective){
      student.set('last_lunch_date',previous);
      snapshot.last_lunch_date=previous;
    }
    student.set('billing_effective_date',effective);
    app.save(student);

    // Saving the student may have already produced a Nov 12 history row
    // through the PocketBase schedule hook. Update it if present; otherwise
    // move the Nov 13 row to avoid duplicating the student snapshot.
    const existing=app.findRecordsByFilter('schedule_history',
      'daycare = {:school} && entity = {:entity} && effective_date = {:date}',
      '',1,0,{school:school.id,entity:student.id,date:effective});
    if(existing.length){
      const target=existing[0];
      target.set('snapshot',snapshot);
      app.save(target);
      app.delete(future);
    }else{
      future.set('effective_date',effective);
      future.set('snapshot',snapshot);
      app.save(future);
    }
  }
},_app=>{
  // Never reverse a dated roster correction automatically: it can have
  // already affected attendance, invoicing or later student edits.
});
