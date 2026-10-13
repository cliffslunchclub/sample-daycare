module.exports.edit = function(app, actor, id, body) {
  if (!actor || !actor.getBool('active') || ['clc_admin','daycare_admin'].indexOf(actor.getString('role')) < 0) throw new ForbiddenError('Please sign in as an administrator.');
  const date=String(body.service_date || ''),code=String(body.code || '');
  const parsed=new Date(date+'T12:00:00Z');
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const weekday=days[parsed.getUTCDay()];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date || ['Monday','Tuesday','Wednesday','Thursday','Friday'].indexOf(weekday)<0 || ['A','B','C','V'].indexOf(code)<0) throw new BadRequestError('Choose a weekday and substitution option.');
  app.runInTransaction(tx=>{
    const row=tx.findRecordById('substitutions',id),school=tx.findRecordById('daycares',row.getString('daycare'));
    if(actor.getString('role')!=='clc_admin' && actor.getString('daycare')!==school.id) throw new ForbiddenError('School access denied.');
    if(!school.getBool('allow_substitutions') || !row.getBool('recurring')) throw new BadRequestError('This recurring substitution cannot be edited.');
    const student=tx.findRecordById('students',row.getString('student'));
    if(student.getString('daycare')!==school.id) throw new BadRequestError('Student and school do not match.');
    const conflicts=tx.findRecordsByFilter('substitutions','student = {:student} && weekday = {:weekday} && recurring = true && id != {:id}','',1,0,{student:student.id,weekday,id:row.id});
    if(conflicts.length) throw new BadRequestError('A substitution already exists for this student and weekday. Edit that entry instead.');
    row.set('service_date',date);row.set('weekday',weekday);row.set('code',code);
    // Keep the special pizza classification only while the entry remains Friday.
    row.set('pizza_substitution',weekday==='Friday' && row.getBool('pizza_substitution'));
    require(__hooks+'/audit-lib.js').save(tx,row,actor);
  });
};
