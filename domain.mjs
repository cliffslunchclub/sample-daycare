export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
export const CODES = ['A','B','C','V'];
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s+'T12:00:00Z').toISOString().slice(0,10) === s; }
export function dayIndex(date) { return (new Date(date+'T12:00:00Z').getUTCDay()+6)%7; }
export function datesInMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.');
  const [y,m]=month.split('-').map(Number), n=new Date(Date.UTC(y,m,0)).getUTCDate();
  return Array.from({length:n},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);
}
export function weekDates(date) {
  const d=new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-dayIndex(date));
  return DAYS.map((_,i)=>{const x=new Date(d);x.setUTCDate(x.getUTCDate()+i);return x.toISOString().slice(0,10);});
}
export function versionOn(student,date) {
  return student.versions.filter(v=>v.effective<=date).sort((a,b)=>b.effective.localeCompare(a.effective))[0];
}
export function mealsOn(students,location,date,closures=[]) {
  const di=dayIndex(date);
  if(di>4 || closures.some(c=>c.locationId===location.id&&c.date===date)) return [];
  return students.filter(s=>s.locationId===location.id).flatMap(s=>{
    const v=versionOn(s,date); if(!v||!v.active) return [];
    const override=(s.exceptions||[]).find(e=>e.date===date);
    const code=override?override.code:v.days[di]; if(!code) return [];
    return [{studentId:s.id,name:s.name,classroom:v.classroom,size:location.sizes?v.size:'Standard',code,billing:v.billing,allergy:v.allergy||'',instructions:v.instructions||''}];
  });
}
export function counts(meals) {
  const standard=meals.filter(m=>m.code==='standard').length;
  return {total:meals.length,standard,substitutions:meals.length-standard,school:meals.filter(m=>m.billing==='school').length,clc:meals.filter(m=>m.billing==='clc').length,subsidized:meals.filter(m=>m.billing==='subsidized').length,pizzas:Math.ceil(standard/3)};
}
export function projection(students,location,month,closures,adjustments) {
  const days=datesInMonth(month).filter(d=>dayIndex(d)<5).map(date=>({date,...counts(mealsOn(students,location,date,closures))}));
  const scheduled=days.reduce((s,d)=>s+d.school,0);
  const rows=adjustments.filter(a=>a.locationId===location.id&&a.month===month&&!a.deleted);
  const units=rows.reduce((s,a)=>s+a.units,0);
  return {month,locationId:location.id,scheduled,adjustments:rows,adjustmentUnits:units,billable:scheduled+units,rateCents:location.rateCents,subtotalCents:(scheduled+units)*location.rateCents,days};
}
