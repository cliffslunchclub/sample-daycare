const lib=require(__hooks+'/billing-lib.js');
const key=(entity,rate)=>entity+'|'+Math.round(Number(rate)*100);
function period(invoice){const start=invoice.period_start||invoice.month+'-01',d=new Date(invoice.month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return {start,end:invoice.period_end||d.toISOString().slice(0,10)};}
function capture(school,history,menus,start,end){
 const units={};
 function add(entity,label,date,quantity,rate){const id=key(entity,rate);if(!units[id])units[id]={entity,label,rate,quantity:0,dates:[]};units[id].quantity+=quantity;if(quantity)units[id].dates.push(date);}
 for(let date=start;date<=end;date=lib.addDays(date,1)){
  const day=lib.daily(school,history,menus,date),state=lib.latest(history,'school',date);if(day.closed)continue;
  if(state.count_mode==='manual')add('school','School counts',date,day.quantity,day.rate);
  else for(const student of day.roster)add('student:'+student.id,student.name||'Student',date,1,day.rate);
 }
 return {version:1,start,end,units};
}
function requestUnits(snapshot,requests,school,history,menus){
 const units={};
 for(const r of requests.filter(r=>r.kind==='lunch'&&r.service_date>=snapshot.start&&r.service_date<=snapshot.end)){
  const day=lib.daily(school,history,menus,r.service_date),included=r.status==='approved'&&!day.closed&&!day.roster.some(k=>k.id===r.student||String(k.name||'').trim().toLowerCase()===String(r.student_label||'').trim().toLowerCase());
  units[key('request:'+r.id,day.rate)]={entity:'request:'+r.id,label:r.student_label||'One-off student',rate:day.rate,quantity:included?1:0,dates:[r.service_date],request_id:r.id};
 }
 return units;
}
function pending(source,current,requests,invoices){
 const reference=source.closed_snapshot?.reference;if(!reference)return [];
 const old={...reference.units,...(reference.requests||{})},now={...current.units,...requests};
 const applied={},accountedDates={},dateVersions={};for(const invoice of invoices)if(invoice.id!==source.id)for(const line of invoice.lines||[]){
  if(line.pending_source===source.id&&line.pending_unit){applied[line.pending_unit]=(applied[line.pending_unit]||0)+Number(line.quantity);if(line.pending_dates&&String(line.pending_at||'')>=String(dateVersions[line.pending_unit]||'')){accountedDates[line.pending_unit]=line.pending_dates;dateVersions[line.pending_unit]=line.pending_at||'';}}
  // Earlier TLE carry-forward lines already billed must not be billed twice.
  else if(line.carry_source===source.id){const id=key('school',line.rate);applied[id]=(applied[id]||0)+Number(line.quantity);}
 }
 return [...new Set([...Object.keys(old),...Object.keys(now),...Object.keys(applied)])].sort().flatMap(id=>{
  const a=old[id],b=now[id],unit=b||a;if(!unit)return [];
  const billed=Number(a?.quantity||0)+Number(applied[id]||0),scheduled=Number(b?.quantity||0),quantity=scheduled-billed;if(!quantity)return [];
  const previousDates=accountedDates[id]||a?.dates||[],changedDates=[...new Set([...previousDates,...(b?.dates||[])])].filter(date=>previousDates.includes(date)!==(b?.dates||[]).includes(date)).sort();
  const dates=changedDates.length===Math.abs(quantity)?changedDates:[];
  const service=dates.length?dates.map(lib.displayDate).join(', '):lib.displayDate(reference.start)+' to '+lib.displayDate(reference.end);
  const entity=unit.entity,idKey=source.id+'::'+id;
  const description=(entity.startsWith('request:')?'One-off lunch correction':'Schedule correction')+' for '+source.number+': '+unit.label+' - '+service+' ('+(quantity>0?'+':'')+quantity+' meals)';
  const item={id:idKey,source_id:source.id,source_number:source.number,source_end:reference.end,unit:id,entity,label:unit.label,service_dates:dates,period_start:reference.start,period_end:reference.end,previous_quantity:billed,current_quantity:scheduled,current_dates:b?.dates||[],quantity,rate:unit.rate,taxable:true,amount_cents:Math.round(quantity*Math.round(unit.rate*100)),description,request_id:unit.request_id};
  item.token=JSON.stringify([item.id,billed,scheduled,item.rate,description]);return [item];
 });
}
function validateClose(invoice,reference){
 if(!invoice.shared&&invoice.status!=='issued')throw new Error('Save the invoice before closing it.');
 if(!reference?.version)throw new Error('Recalculate and save this draft before closing it, so its schedule can be preserved.');
 const schedule=(invoice.lines||[]).filter(l=>l.baseline||l.adjustment_type==='schedule');
 const actual=Object.values(reference.units||{}).reduce((n,u)=>n+Math.round(u.quantity*Math.round(u.rate*100)),0);
 const billed=schedule.reduce((n,l)=>n+Math.round(l.quantity*Math.round(l.rate*100)),0);
 if(actual!==billed)throw new Error('Scheduled lines differ from the generated schedule. Recalculate and save before closing. Keep discretionary charges or credits on manual adjustment lines.');
}
module.exports={key,period,capture,requestUnits,pending,validateClose};
