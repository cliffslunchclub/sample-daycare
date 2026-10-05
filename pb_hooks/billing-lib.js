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
module.exports={validDate,latest,daily,totals,weekdays,nyDate,requestDates}
