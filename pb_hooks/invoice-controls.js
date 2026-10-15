const lib=require(__hooks+'/billing-lib.js');
function key(line){return JSON.stringify([line.description,Number(line.quantity),Number(line.rate),line.taxable!==false,line.adjustment_type||'',line.schedule_entity||'']);}
function removed(invoice){return JSON.parse(invoice.getString('removed_adjustments')||'null')||[];}
function sync(invoice,lines){invoice.set('removed_adjustments',removed(invoice).filter(entry=>lines.some(line=>key(line)===entry.key)));}
function filter(invoice,lines){const omitted=removed(invoice);return lines.filter(l=>!omitted.some(x=>x.key===key(l)));}
function draftItems(app,school){
 const result=[];
 for(const invoice of app.findRecordsByFilter('invoices','daycare = {:school} && status = "draft"','',0,0,{school:school.id}))for(const entry of removed(invoice).filter(x=>!x.dismissed)){
  const l=entry.line,id='draft:'+invoice.id+':'+entry.key;
  result.push({id,source_kind:'draft',source_id:invoice.id,source_number:invoice.getString('number'),source_end:'',unit:entry.key,label:l.student_label||l.description,description:l.description,quantity:l.quantity,rate:l.rate,taxable:l.taxable!==false,amount_cents:Math.round(l.quantity*Math.round(l.rate*100)),service_dates:l.service_dates||[],period_start:invoice.getString('period_start')||invoice.getString('month')+'-01',period_end:require(__hooks+'/invoice-adjustment-lib.js').period({month:invoice.getString('month'),period_end:invoice.getString('period_end')}).end,previous_quantity:0,current_quantity:l.quantity,token:JSON.stringify(entry)});
 }
 return result;
}
function remove(app,school,actor,body){
 const ops=require(__hooks+'/invoice-adjustments.js'),invoice=app.findRecordById('invoices',String(body.id||''));
 if(invoice.getString('daycare')!==school.id||invoice.getString('status')!=='draft')throw new Error('Choose a draft invoice in this school.');
 const lines=JSON.parse(invoice.getString('lines')||'[]'),index=Number(body.index),line=lines[index];
 if(!Number.isInteger(index)||!line||JSON.stringify(line)!==String(body.token))throw new Error('This line changed. Save or refresh the invoice before removing it.');
 if(line.baseline||(!line.request_id&&!line.pending_source&&!line.adjustment_type))throw new Error('Remove manual lines using the invoice editor. The main scheduled lunch charge cannot be removed.');
 if(line.pending_source)return ops.remove(app,school,actor,body);
 if(line.request_id){
  const r=app.findRecordById('lunch_requests',line.request_id);if(r.getString('daycare')!==school.id||r.getString('invoice_id')!==invoice.id)throw new Error('This request assignment changed. Refresh first.');
  r.set('invoice_id','');r.set('billing_deferred',true);require(__hooks+'/audit-lib.js').save(app,r,actor);
 }else{
  if(line.adjustment_type!=='schedule'||!line.schedule_entity)throw new Error('Recalculate this older draft first so its adjustment can be tracked safely.');
  const entries=removed(invoice);entries.push({key:key(line),line});invoice.set('removed_adjustments',entries);
 }
 lines.splice(index,1);ops.totals(app,invoice,lines,actor);return ops.plain(invoice);
}
function adjustedReference(invoice,reference){
 const copy=JSON.parse(JSON.stringify(reference));copy.dismissed={};
 for(const entry of removed(invoice)){
  const l=entry.line,id=require(__hooks+'/invoice-adjustment-lib.js').key(l.schedule_entity,l.rate);
  let unit=copy.units[id];if(!unit)unit=copy.units[id]={entity:l.schedule_entity,label:l.student_label||'School counts',rate:l.rate,quantity:0,dates:[]};
  unit.quantity-=l.quantity;
  const dates=l.service_dates||[];unit.dates=l.quantity>0?unit.dates.filter(d=>!dates.includes(d)):[...new Set([...unit.dates,...dates])].sort();
  if(entry.dismissed)copy.dismissed[id]={current_quantity:reference.units[id]?.quantity||0,quantity:(copy.dismissed[id]?.quantity||0)+l.quantity};
 }
 return copy;
}
module.exports={sync,key,removed,filter,draftItems,remove,adjustedReference};
