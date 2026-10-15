export type RosterStudent = { active:boolean; last_lunch_date?:string };
export function schoolToday(now=new Date()):string {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}-${parts.find(p=>p.type==='day')!.value}`;
}
export function pastStudent(student:RosterStudent,date=schoolToday()):boolean {
 return !student.active || Boolean(student.last_lunch_date && student.last_lunch_date<date);
}
export function studentScheduled(student:RosterStudent,date:string):boolean {
 return student.active && (!student.last_lunch_date || date<=student.last_lunch_date);
}
export function inRoster(student:RosterStudent,filter:string,date=schoolToday()):boolean {
 return filter==='all' || (filter==='past'?pastStudent(student,date):!pastStudent(student,date));
}
