// Move the October 7 additions/removals approved by CLC to October 8.
// Do not shift weekday edits, manual school counts, or other dates.
migrate((app) => {
  const from='2026-10-07', to='2026-10-08';
  const rows=app.findRecordsByFilter('schedule_history','effective_date = {:date} && entity != "school"','',0,0,{date:from});
  for(const row of rows){
    const previous=app.findRecordsByFilter('schedule_history','daycare = {:school} && entity = {:entity} && effective_date < {:date}','-effective_date',1,0,{school:row.getString('daycare'),entity:row.getString('entity'),date:from});
    const before=previous.length?JSON.parse(previous[0].getString('snapshot')):null;
    const after=JSON.parse(row.getString('snapshot'));
    if(Boolean(before?.active)===Boolean(after.active))continue;
    const next=app.findRecordsByFilter('schedule_history','daycare = {:school} && entity = {:entity} && effective_date = {:date}','',1,0,{school:row.getString('daycare'),entity:row.getString('entity'),date:to});
    // An explicitly scheduled October 8 version takes precedence.
    if(next.length){app.delete(row);continue;}
    else {row.set('effective_date',to);app.save(row);}
    let student;try{student=app.findRecordById('students',row.getString('entity'));}catch(_){continue;}
    if(student.getString('billing_effective_date')===from){student.set('billing_effective_date',to);app.save(student);}
  }
}, (_app) => {
  // Preserve the approved billing dates on rollback rather than rewriting history.
});
