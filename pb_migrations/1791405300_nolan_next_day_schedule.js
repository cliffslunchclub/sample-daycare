// Correct the approved Bergenfield Nolan three-to-two-day change only.
migrate((app) => {
  const schools=app.findRecordsByFilter('daycares','public_slug = "lightbridge-bergenfield"','',1,0);
  if(!schools.length)return;
  const school=schools[0].id,from='2026-10-07',to='2026-10-08';
  const rows=app.findRecordsByFilter('schedule_history','daycare = {:school} && effective_date = {:date} && entity != "school"','',0,0,{school,date:from});
  for(const row of rows){
    const after=JSON.parse(row.getString('snapshot'));
    if(String(after.name||'').trim().split(/\s+/)[0].toLowerCase()!=='nolan')continue;
    const entity=row.getString('entity');
    const prior=app.findRecordsByFilter('schedule_history','daycare = {:school} && entity = {:entity} && effective_date < {:date}','-effective_date',1,0,{school,entity,date:from});
    if(!prior.length)continue;
    const before=JSON.parse(prior[0].getString('snapshot'));
    if(!before.active||!after.active||(before.service_days||[]).length!==3||(after.service_days||[]).length!==2)continue;
    const next=app.findRecordsByFilter('schedule_history','daycare = {:school} && entity = {:entity} && effective_date = {:date}','',1,0,{school,entity,date:to});
    if(next.length){app.delete(row);continue;}
    row.set('effective_date',to);app.save(row);
    let student;try{student=app.findRecordById('students',entity);}catch(_){continue;}
    if(student.getString('billing_effective_date')===from){student.set('billing_effective_date',to);app.save(student);}
  }
}, (_app) => {
  // Retain the approved effective date when rolling back code.
});
