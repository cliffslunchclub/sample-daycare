export type WeeklyRosterData={school_name:string;start:string;end:string;as_of:string;days:{day:string;closed:boolean;unavailable?:boolean;total:number;classrooms:{name:string;total:number;students:{name:string;sub:boolean}[]}[]}[]};
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const rosterDate=(v:string)=>v.slice(5,7)+'-'+v.slice(8,10)+'-'+v.slice(0,4);

const bergenfieldRooms=['Mobile Infants','Purple Cats','Khaki Kangaroo','Yellow Ducks','Blue Horses','Green Frogs','Goldfish','Brown Bears'];
const bergenfieldDays=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const bergenfieldColors:Record<string,string>={
 'Mobile Infants':'#386fc0','Purple Cats':'#7f3cb7','Khaki Kangaroo':'#be8c00',
 'Yellow Ducks':'#d5a100','Blue Horses':'#386fc0','Green Frogs':'#13a466',
 'Goldfish':'#c18d00','Brown Bears':'#81512d',
};
const roomLabel=(value:string)=>value==='Mobiles Infants'?'Mobile Infants':value;
const isBergenfield=(data:WeeklyRosterData)=>/bergenfield/i.test(data.school_name);

function bergenfieldWeeklyGrid(data:WeeklyRosterData):string{
 // Live, effective-dated weekday data from /api/weekly-roster. No snapshot
 // names, manual PDF counts or pizza-slice quantities are hard-coded.
 const days=bergenfieldDays.map(name=>data.days.find(day=>day.day===name));
 const rooms=[...new Set([...bergenfieldRooms,...data.days.flatMap(day=>day.classrooms.map(room=>roomLabel(room.name)))])];
 const dataByRoom=rooms.map(room=>{
   const groups=days.map(day=>day?.classrooms.find(item=>roomLabel(item.name)===room));
   const counts=groups.map((group,index)=>days[index]?.closed||days[index]?.unavailable?0:Number(group?.total||0));
   const columns=groups.map((group,index)=>{
     const day=days[index];
     if(!day||day.unavailable)return ['No saved schedule'];
     if(day.closed)return ['No lunch service'];
     if(!group)return [];
     if(!group.students.length&&group.total)return ['Saved lunch count'];
     return group.students.map(student=>esc(student.name)+(student.sub?' <b class="matrix-sub">(Sub)</b>':''));
   });
   return {room,counts,columns};
 });
 const dailyTotals=days.map(day=>day&&!day.unavailable&&!day.closed?Number(day.total):0);
 const grandTotal=dailyTotals.reduce((sum,value)=>sum+value,0);
 const heading='<div class="matrix-head"><div><span class="matrix-brand">CLIFFS LUNCH CLUB</span>'+
   '<h1>'+esc(data.school_name)+' - Weekly Lunch Roster</h1></div>'+
   '<div class="matrix-week">'+esc(rosterDate(data.start))+' to '+esc(rosterDate(data.end))+
   '<span>As of '+esc(rosterDate(data.as_of))+'</span></div></div>';
 const summaryRows=dataByRoom.map(({room,counts})=>
   '<tr><th scope="row">'+esc(room)+'</th>'+counts.map(n=>'<td>'+n+'</td>').join('')+
   '<td class="matrix-week-count">'+counts.reduce((sum,n)=>sum+n,0)+'</td></tr>'
 ).join('');
 const summary='<section class="matrix-summary"><h2>CLASSROOM DAILY TOTALS</h2>'+
   '<table class="matrix-summary-table"><colgroup><col class="matrix-room-col">'+
   bergenfieldDays.map(()=>'<col>').join('')+'<col class="matrix-week-col"></colgroup>'+
   '<thead><tr><th scope="col">Classroom</th>'+bergenfieldDays.map(day=>'<th scope="col">'+day+'</th>').join('')+
   '<th scope="col">Week</th></tr></thead><tbody>'+summaryRows+
   '<tr class="matrix-grand-total"><th scope="row">Daily Total</th>'+
   dailyTotals.map(n=>'<td>'+n+'</td>').join('')+'<td>'+grandTotal+'</td></tr></tbody></table></section>';
 const blocks=dataByRoom.map(({room,counts,columns})=>{
   // Only rows that hold actual names are included; keep one blank row for
   // completely empty classrooms. Individual table sections may flow to the
   // next printed page, but they cannot split across pages.
   const rowCount=Math.max(1,...columns.map(column=>column.length));
   const rows=Array.from({length:rowCount},(_,index)=>
     '<tr>'+columns.map(column=>'<td>'+(column[index]||'')+'</td>').join('')+'</tr>'
   ).join('');
   const totalRow='<tr class="matrix-total">'+counts.map(n=>'<td>'+ (n||'')+'</td>').join('')+'</tr>';
   const accent=bergenfieldColors[room]||'#425970';
   return '<section class="matrix-room"><table class="matrix-grid"><thead>'+
     '<tr><th class="matrix-room-title" colspan="5" style="color:'+accent+'">'+esc(room)+'</th></tr>'+
     '<tr>'+bergenfieldDays.map(day=>'<th scope="col">'+day+'</th>').join('')+'</tr></thead>'+
     '<tbody>'+rows+totalRow+'</tbody></table></section>';
 }).join('');
 const footer='<div class="matrix-foot"><span>(Sub) = substitution  |  Counts represent lunches, not pizza slices.</span></div>';
 return '<div class="roster-matrix">'+heading+summary+'<div class="matrix-rooms">'+blocks+'</div>'+footer+'</div>';
}
export const weeklyRosterMatrixCss="\n.roster-matrix{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.18;color:#172322;max-width:700px;margin:0 auto}\n.roster-matrix *, .roster-matrix *:before, .roster-matrix *:after{box-sizing:border-box}\n.weekly-roster-preview.matrix-preview{min-width:680px}\n.roster-matrix .matrix-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:1px solid #7b8b83;padding-bottom:7px;margin-bottom:10px}\n.roster-matrix .matrix-brand{display:block;font-weight:700;color:#47715b;font-size:10px;letter-spacing:1px}\n.roster-matrix .matrix-head h1{font-size:17px;font-weight:700;line-height:1.15;margin:2px 0 0;color:#1c2823}\n.roster-matrix .matrix-week{text-align:right;white-space:nowrap;font-size:11px;font-weight:700;color:#3d5045}\n.roster-matrix .matrix-week span{display:block;font-size:10px;font-weight:400;color:#617167;margin-top:2px}\n.roster-matrix .matrix-summary,.roster-matrix .matrix-room{display:block;break-inside:avoid;page-break-inside:avoid}\n.roster-matrix .matrix-summary{margin:0 0 9px}\n.roster-matrix .matrix-summary h2{font-size:12px;line-height:1.15;text-transform:none;letter-spacing:0;font-weight:700;color:#263a30;margin:0 0 4px;background:none;border:0;padding:0;display:block}\n.roster-matrix table{width:100%;border-collapse:collapse;table-layout:fixed;font-family:inherit;font-size:inherit;margin:0}\n.roster-matrix .matrix-summary-table{max-width:640px;margin:0 auto;border:1px solid #414e46}\n.roster-matrix .matrix-summary-table .matrix-room-col{width:24%}\n.roster-matrix .matrix-summary-table .matrix-week-col{width:9%}\n.roster-matrix .matrix-summary-table th,.roster-matrix .matrix-summary-table td{border:1px solid #636b66;padding:3px 3px;line-height:1.12;vertical-align:middle;text-transform:none;letter-spacing:normal;overflow-wrap:normal}\n.roster-matrix .matrix-summary-table thead th{font-size:10.5px;background:#e7eee8;text-align:center;color:#263a30;font-weight:700}\n.roster-matrix .matrix-summary-table thead th:first-child{text-align:left}\n.roster-matrix .matrix-summary-table tbody th{font-size:10px;text-align:left;background:#fbfbfb;color:#27352d;font-weight:700}\n.roster-matrix .matrix-summary-table tbody td{font-size:10.5px;text-align:center;color:#24352b}\n.roster-matrix .matrix-summary-table .matrix-week-count{font-weight:700;background:#f5f9f5}\n.roster-matrix .matrix-summary-table .matrix-grand-total th,.roster-matrix .matrix-summary-table .matrix-grand-total td{background:#fff6f4;color:#bb2a27;font-weight:700}\n.roster-matrix .matrix-room{margin:0 0 7px}\n.roster-matrix .matrix-grid{border:1px solid #303030}\n.roster-matrix .matrix-grid th,.roster-matrix .matrix-grid td{border:1px solid #4e4e4e;text-align:center;vertical-align:middle;padding:2px 3px;text-transform:none;letter-spacing:normal;overflow-wrap:anywhere;word-break:normal;color:#172322}\n.roster-matrix .matrix-grid thead th{font-size:10.8px;font-weight:700;background:white;line-height:1.15}\n.roster-matrix .matrix-grid thead .matrix-room-title{font-size:12.5px;line-height:1.16;background:#f6f8f6;padding:3px}\n.roster-matrix .matrix-grid tbody td{font-size:10.6px;line-height:1.15;padding:2px 3px}\n.roster-matrix .matrix-grid .matrix-total td{color:#bb2a27;font-weight:700;font-size:11px;padding:3px}\n.roster-matrix .matrix-sub{font-weight:700;font-size:10px;color:#446f57}\n.roster-matrix .matrix-foot{border-top:1px solid #d0d8d2;padding-top:4px;font-size:10px;color:#68786e;margin-top:3px}\n@media print{\n .roster-matrix{max-width:none;margin:0;font-size:10.6px}\n .roster-matrix .matrix-head{position:fixed;top:-.71in;left:0;right:0;margin:0;padding:0 0 5px}\n .roster-matrix .matrix-head h1{font-size:15px}\n .roster-matrix .matrix-brand{font-size:9px}\n .roster-matrix .matrix-week{font-size:10px}\n .roster-matrix .matrix-week span{font-size:9px}\n .roster-matrix .matrix-foot{position:fixed;bottom:-.37in;left:0;right:0;margin:0}\n .roster-matrix .matrix-summary,.roster-matrix .matrix-room,.roster-matrix table{break-inside:avoid;page-break-inside:avoid}\n .roster-matrix .matrix-room{margin-bottom:6px}\n .roster-matrix .matrix-summary{margin-bottom:9px}\n .roster-matrix .matrix-grid th,.roster-matrix .matrix-grid td{padding:1.5px 2px}\n .roster-matrix .matrix-grid thead th{font-size:10.5px}\n .roster-matrix .matrix-grid thead .matrix-room-title{font-size:12px}\n .roster-matrix .matrix-grid tbody td{font-size:10.3px;line-height:1.1;padding:1.5px 2px}\n .roster-matrix .matrix-grid .matrix-total td{font-size:10.5px;padding:2px}\n .roster-matrix .matrix-summary-table th,.roster-matrix .matrix-summary-table td{padding:2.5px 2px}\n .roster-matrix .matrix-room-title,.roster-matrix .matrix-summary-table thead th,.roster-matrix .matrix-grand-total th,.roster-matrix .matrix-grand-total td{-webkit-print-color-adjust:exact;print-color-adjust:exact}\n}\n";

export function weeklyRosterBody(data:WeeklyRosterData):string{
 if(isBergenfield(data))return bergenfieldWeeklyGrid(data);
 return `<header><div class="eyebrow">CLIFFS LUNCH CLUB</div><h1>${esc(data.school_name)} · Weekly Lunch Roster</h1><p><b>${rosterDate(data.start)} to ${rosterDate(data.end)}</b> · As of ${rosterDate(data.as_of)} · (Sub) = substitution</p></header>`+data.days.map(day=>`<section class="roster-day"><h2>${esc(day.day)}${day.unavailable?'':`<span>${day.total} ${day.total===1?'lunch':'lunches'}</span>`}</h2>${day.closed?'<p class="empty-day"><b>No Lunch Service</b></p>':day.unavailable?'<p class="empty-day">No saved schedule for this day</p>':!day.classrooms.length?'<p class="empty-day">No lunches scheduled</p>':`<table><colgroup><col style="width:17%"><col><col style="width:7%"></colgroup><thead><tr><th>Classroom</th><th>Students</th><th class="count">Total</th></tr></thead><tbody>${day.classrooms.map(room=>`<tr><th>${esc(room.name)}</th><td><div class="student-names">${room.students.map(student=>`<span>${esc(student.name)}${student.sub?' <b>(Sub)</b>':''}</span>`).join('')||'<span class="count-only">Saved lunch count</span>'}</div></td><td class="count"><b>${room.total}</b></td></tr>`).join('')}</tbody></table>`}</section>`).join('');
}
export const weeklyRosterCss=`*{box-sizing:border-box}body{font:11px Arial,Helvetica,sans-serif;line-height:1.4;color:#35443a;margin:0}header{margin-bottom:14px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.2px;color:#5b8067}h1{font-size:19px;margin:5px 0}header p{margin:4px 0;color:#59695e}.roster-day{margin:0 0 14px}h2{font-size:13px;background:#e7eee8;border:1px solid #d9e0da;border-radius:4px;padding:7px 10px;display:flex;justify-content:space-between;margin:0 0 5px;break-after:avoid}h2 span{font-size:11px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:6px 8px;border:1px solid #d9e0da;text-align:left;vertical-align:middle;overflow-wrap:anywhere}thead th{font-size:10px;color:#59695e}tbody th{font-size:11px}.count{text-align:center}.student-names{display:flex;flex-wrap:wrap;gap:5px 10px}.student-names>span{flex:0 0 145px;min-width:max-content;white-space:nowrap;overflow-wrap:normal}.student-names b{font-size:10px;color:#5b8067}.student-names>.count-only{flex-basis:100%;min-width:0;color:#59695e}.empty-day{padding:6px 10px;margin:0;border:1px solid #d9e0da}tr{break-inside:avoid}thead{display:table-header-group}@page{size:letter landscape;margin:.35in}@media print{h2{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
export function weeklyRosterHtml(data:WeeklyRosterData):string{
 const title=`Weekly-Lunch-Roster-${data.school_name.replace(/[^a-zA-Z0-9._-]+/g,'-')}-${rosterDate(data.start)}`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${weeklyRosterCss}${isBergenfield(data)?weeklyRosterMatrixCss+'@page{size:letter portrait;margin:.91in .45in .54in}':''}@media screen{html{background:#f6f7f3}body{max-width:1200px;margin:24px auto;padding:32px;background:white}}</style></head><body>${weeklyRosterBody(data)}</body></html>`;
}
