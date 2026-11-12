export type WeeklyRosterData={school_name:string;start:string;end:string;as_of:string;days:{day:string;closed:boolean;unavailable?:boolean;total:number;classrooms:{name:string;total:number;students:{name:string;sub:boolean}[]}[]}[]};
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const rosterDate=(v:string)=>v.slice(5,7)+'-'+v.slice(8,10)+'-'+v.slice(0,4);

const bergenfieldRooms=['Mobile Infants','Purple Cats','Khaki Kangaroo','Yellow Ducks','Blue Horses','Green Frogs','Goldfish','Brown Bears'];
const bergenfieldColors:Record<string,string>={
 'Mobile Infants':'#386fc0','Purple Cats':'#7f3cb7','Khaki Kangaroo':'#be8c00',
 'Yellow Ducks':'#d5a100','Blue Horses':'#386fc0','Green Frogs':'#13a466',
 'Goldfish':'#c18d00','Brown Bears':'#81512d',
};
const roomLabel=(value:string)=>value==='Mobiles Infants'?'Mobile Infants':value;
const isBergenfield=(data:WeeklyRosterData)=>/bergenfield/i.test(data.school_name);
function bergenfieldWeeklyGrid(data:WeeklyRosterData):string{
 const rooms=[...new Set([...bergenfieldRooms,...data.days.flatMap(day=>day.classrooms.map(room=>roomLabel(room.name)))])];
 const pageCount=Math.ceil(rooms.length/3), pages:string[]=[];
 for(let index=0;index<rooms.length;index+=3){
   const blocks=rooms.slice(index,index+3).map(room=>{
     const groups=data.days.map(day=>day.classrooms.find(item=>roomLabel(item.name)===room));
     const cells=data.days.map((day,position)=>{
       if(day.closed)return ['NO LUNCH SERVICE'];
       if(day.unavailable)return ['NO SAVED SCHEDULE'];
       const group=groups[position];
       if(!group)return [];
       if(!group.students.length&&group.total)return ['Saved lunch count'];
       return group.students.map(student=>esc(student.name)+(student.sub?' <b class="matrix-sub">(Sub)</b>':''));
     });
     const count=Math.max(9,...cells.map(column=>column.length));
     const rows=Array.from({length:count},(_,line)=>'<tr>'+cells.map(column=>'<td>'+(column[line]||'')+'</td>').join('')+'</tr>').join('');
     const totalRow='<tr class="matrix-total">'+groups.map(group=>'<td>'+(group?.total?String(group.total):'')+'</td>').join('')+'</tr>';
     const accent=bergenfieldColors[room]||'#425970';
     return '<section class="matrix-room"><table class="matrix-grid"><thead><tr><th class="matrix-room-title" colspan="5" style="color:'+accent+'">'+esc(room)+'</th></tr><tr>'+['Monday','Tuesday','Wednesday','Thursday','Friday'].map(day=>'<th>'+day+'</th>').join('')+'</tr></thead><tbody>'+rows+totalRow+'</tbody></table></section>';
   }).join('');
   const pageNumber=Math.floor(index/3)+1;
   const heading='<div class="matrix-head"><div><span class="matrix-brand">CLIFFS LUNCH CLUB</span><h1>'+esc(data.school_name)+' - Weekly Lunch Roster</h1></div><div class="matrix-week">'+rosterDate(data.start)+' to '+rosterDate(data.end)+'<span>As of '+rosterDate(data.as_of)+'</span></div></div>';
   const footer='<div class="matrix-foot"><span>(Sub) = substitution. Counts are lunches, not pizza slices.</span><span>Page '+pageNumber+' / '+pageCount+'</span></div>';
   pages.push('<div class="matrix-page">'+heading+blocks+footer+'</div>');
 }
 return '<div class="roster-matrix">'+pages.join('')+'</div>';
}
export const weeklyRosterMatrixCss=`
.roster-matrix{font-family:Arial,Helvetica,sans-serif;color:#172322;font-size:11px;line-height:1.15}
.roster-matrix .matrix-page{max-width:690px;margin:0 auto 24px;padding:12px 0;background:white}
.roster-matrix .matrix-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #7b8b83;padding:0 0 8px;margin:0 0 10px;gap:10px}
.roster-matrix .matrix-brand{font-size:9px;letter-spacing:1.2px;font-weight:bold;color:#47715b}
.roster-matrix .matrix-head h1{font-size:15px;line-height:1.15;margin:3px 0 0;color:#1c2823;font-weight:700}
.roster-matrix .matrix-week{text-align:right;white-space:nowrap;font-size:10px;font-weight:700;color:#3d5045}
.roster-matrix .matrix-week span{display:block;font-size:9px;font-weight:400;color:#617167;margin-top:3px}
.roster-matrix .matrix-room{margin:0 0 12px;break-inside:avoid;page-break-inside:avoid}
.roster-matrix .matrix-grid{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #333}
.roster-matrix .matrix-grid th,.roster-matrix .matrix-grid td{border:1px solid #4e4e4e;text-align:center;padding:2px 3px;overflow-wrap:normal;word-break:normal}
.roster-matrix .matrix-grid thead th{height:18px;background:#fff;color:#222;font-size:11px;font-weight:700}
.roster-matrix .matrix-grid thead .matrix-room-title{height:20px;font-size:12px;background:#f8faf8;letter-spacing:.1px}
.roster-matrix .matrix-grid tbody td{height:17px;line-height:1.15;font-size:10px;white-space:nowrap}
.roster-matrix .matrix-grid .matrix-total td{height:19px;color:#c52b28;font-size:11px;font-weight:700;background:#fff}
.roster-matrix .matrix-sub{font-size:9px;color:#446f57;font-weight:700}
.roster-matrix .matrix-foot{border-top:1px solid #d0d8d2;padding-top:5px;display:flex;justify-content:space-between;font-size:9px;color:#68786e}
@media print{.roster-matrix .matrix-page{max-width:none;margin:0;padding:0;break-after:page;page-break-after:always}
.roster-matrix .matrix-page:last-child{break-after:auto;page-break-after:auto}
.roster-matrix .matrix-grid thead .matrix-room-title{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.roster-matrix .matrix-room{break-inside:avoid;page-break-inside:avoid}}
`;

export function weeklyRosterBody(data:WeeklyRosterData):string{
 if(isBergenfield(data))return bergenfieldWeeklyGrid(data);
 return `<header><div class="eyebrow">CLIFFS LUNCH CLUB</div><h1>${esc(data.school_name)} · Weekly Lunch Roster</h1><p><b>${rosterDate(data.start)} to ${rosterDate(data.end)}</b> · As of ${rosterDate(data.as_of)} · (Sub) = substitution</p></header>`+data.days.map(day=>`<section class="roster-day"><h2>${esc(day.day)}${day.unavailable?'':`<span>${day.total} ${day.total===1?'lunch':'lunches'}</span>`}</h2>${day.closed?'<p class="empty-day"><b>No Lunch Service</b></p>':day.unavailable?'<p class="empty-day">No saved schedule for this day</p>':!day.classrooms.length?'<p class="empty-day">No lunches scheduled</p>':`<table><colgroup><col style="width:17%"><col><col style="width:7%"></colgroup><thead><tr><th>Classroom</th><th>Students</th><th class="count">Total</th></tr></thead><tbody>${day.classrooms.map(room=>`<tr><th>${esc(room.name)}</th><td><div class="student-names">${room.students.map(student=>`<span>${esc(student.name)}${student.sub?' <b>(Sub)</b>':''}</span>`).join('')||'<span class="count-only">Saved lunch count</span>'}</div></td><td class="count"><b>${room.total}</b></td></tr>`).join('')}</tbody></table>`}</section>`).join('');
}
export const weeklyRosterCss=`*{box-sizing:border-box}body{font:11px Arial,Helvetica,sans-serif;line-height:1.4;color:#35443a;margin:0}header{margin-bottom:14px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.2px;color:#5b8067}h1{font-size:19px;margin:5px 0}header p{margin:4px 0;color:#59695e}.roster-day{margin:0 0 14px}h2{font-size:13px;background:#e7eee8;border:1px solid #d9e0da;border-radius:4px;padding:7px 10px;display:flex;justify-content:space-between;margin:0 0 5px;break-after:avoid}h2 span{font-size:11px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:6px 8px;border:1px solid #d9e0da;text-align:left;vertical-align:middle;overflow-wrap:anywhere}thead th{font-size:10px;color:#59695e}tbody th{font-size:11px}.count{text-align:center}.student-names{display:flex;flex-wrap:wrap;gap:5px 10px}.student-names>span{flex:0 0 145px;min-width:max-content;white-space:nowrap;overflow-wrap:normal}.student-names b{font-size:10px;color:#5b8067}.student-names>.count-only{flex-basis:100%;min-width:0;color:#59695e}.empty-day{padding:6px 10px;margin:0;border:1px solid #d9e0da}tr{break-inside:avoid}thead{display:table-header-group}@page{size:letter landscape;margin:.35in}@media print{h2{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
export function weeklyRosterHtml(data:WeeklyRosterData):string{
 const title=`Weekly-Lunch-Roster-${data.school_name.replace(/[^a-zA-Z0-9._-]+/g,'-')}-${rosterDate(data.start)}`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${weeklyRosterCss}${isBergenfield(data)?weeklyRosterMatrixCss+'@page{size:letter portrait;margin:.38in .52in}':''}@media screen{html{background:#f6f7f3}body{max-width:1200px;margin:24px auto;padding:32px;background:white}}</style></head><body>${weeklyRosterBody(data)}</body></html>`;
}
