import type { InvoiceLine } from './invoicePdf';
const date=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(5,7)+'-'+v.slice(8,10)+'-'+v.slice(0,4):v;
export function invoiceRows(lines:InvoiceLine[]):{line:InvoiceLine;indices:number[]}[]{
 const result:{line:InvoiceLine;indices:number[]}[]=[],groups=new Map<string,number>();
 const identities=new Map<string,Set<string>>();for(const l of lines)if(l.request_student&&l.request_label){const label=l.request_label.trim().toLowerCase();if(!identities.has(label))identities.set(label,new Set());identities.get(label)!.add(l.request_student);}
 lines.forEach((line,index)=>{
  if(!line.request_id&&!line.pending_request){result.push({line,indices:[index]});return;}
  const label=line.request_label||line.pending_label||line.description.match(/^One-off lunch: (.+?) \(/)?.[1];
  if(!label){result.push({line,indices:[index]});return;}
  const known=identities.get(label.trim().toLowerCase());
  const key=JSON.stringify([line.request_student||(known?.size===1?[...known][0]:label.trim().toLowerCase()),line.rate,line.taxable!==false,Math.sign(line.quantity)]);
  let slot=groups.get(key);
  if(slot===undefined){slot=result.length;groups.set(key,slot);result.push({line:{...line,request_label:label,service_dates:line.service_dates||line.description.match(/\d{2}-\d{2}-\d{4}/g)||[]},indices:[index]});}
  else{const row=result[slot];row.indices.push(index);row.line={...row.line,quantity:row.line.quantity+line.quantity,amount_cents:(row.line.amount_cents??Math.round((row.line.quantity)*Math.round(row.line.rate*100)))+(line.amount_cents??Math.round(line.quantity*Math.round(line.rate*100))),service_dates:[...new Set([...(row.line.service_dates||[]),...(line.service_dates||line.description.match(/\d{2}-\d{2}-\d{4}/g)||[])])]};}
 });
 return result.map(row=>{
  if(row.indices.length<2)return row;
  const l=row.line,sources=[...new Set(row.indices.map(i=>lines[i].pending_source?(lines[i].pending_number||lines[i].description.match(/^One-off lunch correction for (.+?):/)?.[1]||'prior invoice'):'').filter(Boolean))],dates=[...(l.service_dates||[])].sort((a,b)=>{const iso=(s:string)=>/^\d{2}-/.test(s)?s.slice(6)+'-'+s.slice(0,2)+'-'+s.slice(3,5):s;return iso(a).localeCompare(iso(b));});
  return {...row,line:{...l,description:`${l.request_label} — ${Math.abs(l.quantity)} one-off lunches${l.quantity<0?' (credit)':''} (${dates.map(date).join(', ')})${sources.length?' · Corrections for '+sources.join(', '):''}`}};
 });
}

type PendingRow=Record<string,any>;
export function pendingRows(items:PendingRow[]):PendingRow[]{
 const rows:PendingRow[]=[],groups=new Map<string,PendingRow>();
 for(const item of items){
  const key=item.request_id?JSON.stringify([item.source_kind||'closed',item.source_id,item.request_student||String(item.label||'').trim().toLowerCase(),Number(item.rate),item.taxable!==false,Math.sign(item.quantity)]):'single:'+item.id;
  let row=groups.get(key);
  if(!row){row={...item,members:[],service_dates:[],quantity:0,amount_cents:0,previous_quantity:0,current_quantity:0};groups.set(key,row);rows.push(row);}
  row.members.push(item);row.quantity+=Number(item.quantity);row.amount_cents+=Number(item.amount_cents);row.previous_quantity+=Number(item.previous_quantity||0);row.current_quantity+=Number(item.current_quantity||0);row.service_dates=[...new Set([...row.service_dates,...(item.service_dates||[])])].sort();
 }
 return rows;
}
