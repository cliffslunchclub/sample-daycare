const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value
function latest(history, entity, date) {
  return history.filter(row => row.entity === entity && row.effective_date <= date).sort((a,b) => b.effective_date.localeCompare(a.effective_date))[0]?.snapshot
}
function daily(school, history, menus, date) {
  const day = weekdays[new Date(date+'T12:00:00Z').getUTCDay()]
  const state = latest(history, 'school', date)
  if (!state) throw new Error('No count history for '+date+'. Set an effective date covering this period before generating an invoice.')
  const closed = ['Saturday','Sunday'].includes(day) || (school.public_slug === 'tle-englewood-cliffs' && day === 'Friday') || menus.some(row=>row.service_date.slice(0,10)===date && row.closed)
  const roster = [...new Set(history.filter(row=>row.entity!=='school').map(row=>row.entity))].map(id=>({id,...latest(history,id,date)})).filter(row=>row.active && (row.service_days||[]).includes(day))
  const quantity = closed ? 0 : state.count_mode==='manual' ? Number((state.baseline_counts||{})[day]||0) : roster.length
  const allergies = closed ? 0 : state.count_mode==='manual' ? Number((state.clc_managed_counts||{})[day]||0) : 0
  return {date, day, closed, quantity, allergies, rate:Number(state.invoice_rate), roster}
}
function totals(lines) {
  if(!Array.isArray(lines)||!lines.length||lines.length>200) throw new Error('Use 1 to 200 invoice lines.')
  let subtotal=0, taxable=0
  const normalized=lines.map(line=>{
    const quantity=Number(line.quantity), rate=Number(line.rate)
    if(!String(line.description||'').trim() || String(line.description).length>1000 || !Number.isFinite(quantity)||!Number.isFinite(rate)||rate<0||rate>100000||Math.abs(quantity)>1000000) throw new Error('Check descriptions, quantities, and positive rates. Use negative quantities for credits.')
    const amount_cents=Math.round(quantity*Math.round(rate*100)); subtotal+=amount_cents; if(line.taxable!==false)taxable+=amount_cents
    return {...line,description:String(line.description).trim(),quantity,rate:Math.round(rate*100)/100,taxable:line.taxable!==false,amount_cents}
  })
  const tax=Math.round(taxable*0.06625)
  return {lines:normalized,subtotal_cents:subtotal,tax_cents:tax,total_cents:subtotal+tax}
}
function nyDate(now=new Date()) {
  const year=now.getUTCFullYear(), march=new Date(Date.UTC(year,2,1)), november=new Date(Date.UTC(year,10,1));
  const spring=Date.UTC(year,2,1+(7-march.getUTCDay())%7+7,7), fall=Date.UTC(year,10,1+(7-november.getUTCDay())%7,6);
  const offset=now.getTime()>=spring && now.getTime()<fall ? 4 : 5;
  return new Date(now.getTime()-offset*3600000).toISOString().slice(0,10);
}
function requestDates(values, single) {
  if(values!==undefined && !Array.isArray(values))throw new Error('Lunch dates must be a list.')
  const dates=[...new Set((values===undefined?[single]:values).map(value=>String(value||'')))].sort();
  if(!dates.length || dates.length>31 || dates.some(date=>!validDate(date)))throw new Error('Choose between 1 and 31 valid lunch dates.')
  return dates;
}
const displayDate = value => validDate(String(value||'').slice(0,10)) ? String(value).slice(5,7)+'-'+String(value).slice(8,10)+'-'+String(value).slice(0,4) : String(value||'');
const monthLabel = value => ['January','February','March','April','May','June','July','August','September','October','November','December'][Number(value.slice(5))-1]+' '+value.slice(0,4);
const shortName = value => { const parts=String(value||'').trim().split(/\s+/); return parts.length>1 ? parts[0]+' '+parts[parts.length-1][0] : parts[0]; };
function monthlyPlan(school,history,menus,month) {
  const start=month+'-01', baseline=latest(history,'school',start);
  if(!baseline)throw new Error('No count history for '+displayDate(start)+'. Set an effective date covering this period.');
  const entities=[...new Set(history.filter(row=>row.entity!=='school').map(row=>row.entity))], groups={},changes={},counts=[];
  const attends=(state,day)=>state?.active && (state.service_days||[]).includes(day) ? 1 : 0;
  for(let date=new Date(start+'T12:00:00Z');date.toISOString().startsWith(month);date.setUTCDate(date.getUTCDate()+1)) {
    const d= daily(school,history,menus,date.toISOString().slice(0,10));counts.push({date:d.date,quantity:d.quantity,rate:d.rate,closed:d.closed,day:d.day});if(d.closed)continue;
    const baseQuantity=baseline.count_mode==='manual'?Number((baseline.baseline_counts||{})[d.day]||0):entities.reduce((n,id)=>n+attends(latest(history,id,start),d.day),0);
    if(baseQuantity)groups[d.rate]=(groups[d.rate]||0)+baseQuantity;
    const state=latest(history,'school',d.date);
    function adjustment(delta,label,effective){if(!delta)return;const sign=delta>0?'additions':'removals',key=label+'|'+effective+'|'+d.rate+'|'+sign;if(!changes[key])changes[key]={description:'Midmonth '+sign+': '+label+' - effective '+displayDate(effective),quantity:0,rate:d.rate,taxable:true,adjustment_type:'schedule',effective_date:effective,student_label:label};changes[key].quantity+=delta;}
    if(baseline.count_mode==='roster' && state.count_mode==='roster') {
      for(const id of entities){const base=latest(history,id,start),current=latest(history,id,d.date),delta=attends(current,d.day)-attends(base,d.day);if(delta){const version=history.filter(row=>row.entity===id&&row.effective_date<=d.date).sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0];adjustment(delta,shortName(current?.name||base?.name||'Student'),version.effective_date);}}
    }else {
      const version=history.filter(row=>row.entity==='school'&&row.effective_date<=d.date).sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0];adjustment(d.quantity-baseQuantity,'School counts',version.effective_date);
    }
  }
  const lines=Object.keys(groups).map(rate=>({description:monthLabel(month)+' Lunch Catering - baseline',baseline:true,quantity:groups[rate],rate:Number(rate),taxable:true})).concat(Object.values(changes));
  const service=counts.filter(d=>!d.closed && d.quantity>0), notes=['Total service days: '+service.length+'.'];
  const baseDays=counts.filter(d=>!d.closed).map(d=>({...d,quantity:baseline.count_mode==='manual'?Number((baseline.baseline_counts||{})[d.day]||0):entities.reduce((n,id)=>n+attends(latest(history,id,start),d.day),0)})).filter(d=>d.quantity>0);
  if(baseDays.length && baseDays.every(d=>d.quantity===baseDays[0].quantity))notes.push('Baseline: '+baseDays[0].quantity+' meals per day x '+baseDays.length+' days = '+baseDays.reduce((n,d)=>n+d.quantity,0)+' meals.');
  else for(const day of weekdays.slice(1,6)){const days=baseDays.filter(d=>d.day===day);if(days.length)notes.push(day+': '+days[0].quantity+' meals/day x '+days.length+' days = '+days.reduce((n,d)=>n+d.quantity,0)+' baseline meals.');}
  for(const line of Object.values(changes))notes.push(line.description+': '+(line.quantity>0?'+':'')+line.quantity+' meals.');
  notes.push('Total scheduled meals: '+service.reduce((n,d)=>n+d.quantity,0)+'.');
  return {lines,counts,notes:notes.join('\n')};
}
module.exports={validDate,latest,daily,totals,weekdays,nyDate,requestDates,displayDate,monthlyPlan,monthLabel}
