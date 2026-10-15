const lib=require(__hooks+'/billing-lib.js');
function build(app,school,today=lib.nyDate()){
 const weekday=new Date(today+'T12:00:00Z').getUTCDay(),start=lib.addDays(today,-((weekday+6)%7)),end=lib.addDays(start,4);
 const d=require(__hooks+'/invoice-adjustments.js').data(app,school),rooms=app.findRecordsByFilter('classrooms','daycare = {:school}','',0,0,{school:school.id}).map(r=>({id:r.id,name:r.getString('name'),order:r.getInt('age_order')}));
 const subs=app.findRecordsByFilter('substitutions','daycare = {:school}','',0,0,{school:school.id}).map(r=>({student:r.getString('student'),date:r.getString('service_date').slice(0,10),weekday:r.getString('weekday'),recurring:r.getBool('recurring'),code:r.getString('code')}));
 const students=app.findRecordsByFilter('students','daycare = {:school}','',0,0,{school:school.id}).map(r=>({id:r.id,name:r.getString('name'),classroom:r.getString('classroom')}));
 // Older attendance snapshots did not store classroom IDs. Use retained audit
 // before-values to avoid assigning an upcoming classroom move to earlier days.
 const moves=app.findRecordsByFilter('audit_logs','daycare = {:school} && entity_type = "students"','',0,0,{school:school.id}).map(r=>({entity:r.getString('entity_id'),date:r.getString('effective_date'),changes:JSON.parse(r.getString('changes')||'{}')})).filter(r=>r.changes.classroom&&!r.changes.__undone&&!r.changes.__undo);
 function classroom(id,state,date){if(state.classroom)return state.classroom;const next=moves.filter(m=>m.entity===id&&m.date>date).sort((a,b)=>a.date.localeCompare(b.date))[0];return next?.changes.classroom.before||students.find(s=>s.id===id)?.classroom||'';}
 const days=[];
 for(let date=start;date<=end;date=lib.addDays(date,1)){
  const name=lib.weekdays[new Date(date+'T12:00:00Z').getUTCDay()],state=lib.latest(d.history,'school',date);
  if(!state){days.push({day:name,date,unavailable:true,closed:false,total:0,classrooms:[]});continue;}
  const day=lib.daily(d.school,d.history,d.menus,date),groups=new Map();
  function group(id,label){const room=rooms.find(r=>r.id===id)||rooms.find(r=>r.name===label),key=room?.id||label||'unassigned';if(!groups.has(key))groups.set(key,{name:room?.name||label||'Unassigned',order:room?.order??10000,total:0,students:[]});return groups.get(key);}
  function add(id,label,name,sub){const g=group(id,label);g.students.push({name,sub});g.total++;}
  if(!day.closed){
   if(state.count_mode==='manual'){if(day.quantity){const g=group('','School Lunches');g.total=day.quantity;}if(day.allergies){const g=group('','CLC-Managed Lunches');g.total=day.allergies;}}
   else for(const student of day.roster){const room=classroom(student.id,student,date),sub=subs.some(s=>s.student===student.id&&s.code&&(s.recurring?s.weekday===name&&(!s.date||s.date<=date):s.date===date));add(room,'',student.name||students.find(s=>s.id===student.id)?.name||'Student',sub);}
   for(const r of d.requests.filter(r=>r.kind==='lunch'&&r.status==='approved'&&r.service_date===date)){
    if(day.roster.some(s=>s.id===r.student||String(s.name||'').trim().toLowerCase()===String(r.student_label||'').trim().toLowerCase()))continue;
    add('',r.classroom_label||'Unassigned',r.student_label||students.find(s=>s.id===r.student)?.name||'Trial Student',Boolean(r.code));
   }
  }
  const classrooms=[...groups.values()].sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name));for(const room of classrooms)room.students.sort((a,b)=>a.name.localeCompare(b.name));
  days.push({day:name,date,closed:day.closed,total:classrooms.reduce((n,r)=>n+r.total,0),classrooms});
 }
 return {school_id:school.id,school_name:school.getString('name'),start,end,as_of:today,days};
}
module.exports={build};
