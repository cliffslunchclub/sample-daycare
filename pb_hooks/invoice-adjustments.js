const lib=require(__hooks+'/billing-lib.js'),calc=require(__hooks+'/invoice-adjustment-lib.js');
function plain(row){const value=JSON.parse(JSON.stringify(row.publicExport()));for(const name of ['lines','daily_counts','billing_snapshot','closed_snapshot','snapshot','service_days','baseline_counts','clc_managed_counts']){if(row.collection().fields.getByName(name))value[name]=JSON.parse(row.getString(name)||'null');}return value;}
function data(app,school){
 const rows=name=>app.findRecordsByFilter(name,'daycare = {:school}','',0,0,{school:school.id}).map(plain);
 const students=rows('students');return {school:plain(school),history:lib.withDepartures(rows('schedule_history'),students),menus:rows('menu_days'),requests:rows('lunch_requests'),invoices:rows('invoices')};
}
function snapshot(app,school,invoice){const d=data(app,school),p=calc.period(plain(invoice));return calc.capture(d.school,d.history,d.menus,p.start,p.end);}
function list(app,school,includeDismissed=false){
 const d=data(app,school),items=[];
 for(const source of d.invoices.filter(i=>i.status==='closed'&&i.closed_snapshot?.reference&&!i.closed_snapshot.reference.correction_only)){
  const ref=source.closed_snapshot.reference,current=calc.capture(d.school,d.history,d.menus,ref.start,ref.end);
  // Older aggregate-only references compare totals without inventing student names.
  if(ref.aggregate){const units={};for(const u of Object.values(current.units)){const id=calc.key('school',u.rate);if(!units[id])units[id]={entity:'school',label:'School counts',rate:u.rate,quantity:0,dates:[]};units[id].quantity+=u.quantity;units[id].dates=[...new Set([...units[id].dates,...u.dates])];}current.units=units;}
  items.push(...calc.pending(source,current,calc.requestUnits(ref,d.requests,d.school,d.history,d.menus),d.invoices).filter(item=>{const hidden=ref.dismissed?.[item.unit];return !hidden||hidden.quantity!==item.quantity||hidden.current_quantity!==item.current_quantity;}));
 }
 for(const request of d.requests.filter(r=>r.kind==='lunch'&&r.status==='approved'&&r.billing_deferred&&!r.invoice_id&&!closedDate(app,school,r.service_date))){
  const line=require(__hooks+'/lunch-request-lib.js').line(app,school,app.findRecordById('lunch_requests',request.id));if(!line.quantity)continue;
  const item={id:'request:'+request.id,source_kind:'request',source_id:'',source_number:'Unbilled lunch',source_end:request.service_date,unit:request.id,label:request.student_label,request_id:request.id,request_student:request.student,description:line.description,quantity:line.quantity,rate:line.rate,taxable:true,amount_cents:Math.round(line.quantity*Math.round(line.rate*100)),service_dates:[request.service_date],period_start:request.service_date,period_end:request.service_date,previous_quantity:0,current_quantity:line.quantity};item.token=JSON.stringify([request.id,request.status,request.invoice_id,request.service_date,line]);items.push(item);
 }
 items.push(...require(__hooks+'/invoice-controls.js').draftItems(app,school));
 for(const item of items)if(item.request_id)item.request_student=d.requests.find(r=>r.id===item.request_id)?.student||'';
 const dismissed=(JSON.parse(school.getString('invoice_adjustment_dismissals')||'null')||{});
 return includeDismissed?items:items.filter(item=>dismissed[item.id]!==item.token);
}
function closedDate(app,school,date){return app.findRecordsByFilter('invoices','daycare = {:school} && status = "closed"','',0,0,{school:school.id}).some(i=>{const p=calc.period(plain(i));return p.start<=date&&p.end>=date;});}
function notes(invoice,base){
 const saved=JSON.parse(invoice.getString('lines')||'[]'),prior=saved.filter(l=>l.pending_source),service=saved.filter(l=>l.request_id||l.adjustment_type==='schedule');
 const keep=String(base===undefined?invoice.getString('generated_notes'):base).split('\n').filter(line=>!['Prior invoice correction:','One-off lunch:','Midmonth additions:','Midmonth removals:','Period additions:','Period removals:'].some(prefix=>line.startsWith(prefix)));
 invoice.set('generated_notes',keep.concat(service.map(l=>l.description+': '+(l.quantity>0?'+':'')+l.quantity+' meals'),prior.map(l=>'Prior invoice correction: '+l.description+': '+(l.quantity>0?'+':'')+l.quantity+' meals')).filter(Boolean).join('\n'));
}
function totals(app,invoice,lines,actor){const sum=lib.totals(lines.length?lines:[{description:'Adjustment',quantity:0,rate:0,taxable:true}]);for(const k of Object.keys(sum))invoice.set(k,sum[k]);notes(invoice);require(__hooks+'/audit-lib.js').save(app,invoice,actor);}
function apply(app,school,actor,body){
 const target=app.findRecordById('invoices',String(body.id||''));
 if(target.getString('daycare')!==school.id||target.getString('status')!=='draft')throw new Error('Choose a draft invoice in this school.');
 const selected=Array.isArray(body.items)?body.items:[];
 if(!selected.length||selected.length>150||new Set(selected.map(i=>i.id)).size!==selected.length)throw new Error('Select between 1 and 150 different adjustments.');
 const available=list(app,school),start=calc.period(plain(target)).start,chosen=[];
 for(const item of selected){const row=available.find(r=>r.id===item.id);if(!row||row.token!==item.token)throw new Error('These adjustments changed or were already applied. Refresh and review them again. Nothing was added.');if(row.source_kind==='draft'&&row.source_id!==target.id)throw new Error('Restore this removed schedule adjustment to its original draft. After that invoice is closed, it can be applied to a later period.');if(row.source_kind==='request'&&row.period_start>calc.period(plain(target)).end)throw new Error('Choose a draft covering this lunch date or a later period.');if(!row.source_kind&&row.source_end>=start)throw new Error('Choose a draft for a later service period.');chosen.push(row);}
 const lines=JSON.parse(target.getString('lines')||'[]');
 for(const r of chosen){
  if(r.source_kind==='draft'){const entries=require(__hooks+'/invoice-controls.js').removed(target),entry=entries.find(x=>x.key===r.unit);lines.push(entry.line);target.set('removed_adjustments',entries.filter(x=>x!==entry));continue;}
  if(r.source_kind==='request'){const request=app.findRecordById('lunch_requests',r.request_id);lines.push(require(__hooks+'/lunch-request-lib.js').line(app,school,request));request.set('billing_deferred',false);request.set('invoice_id',target.id);require(__hooks+'/audit-lib.js').save(app,request,actor);continue;}
  lines.push({description:r.description,quantity:r.quantity,rate:r.rate,taxable:true,adjustment_type:'pending',pending_source:r.source_id,pending_number:r.source_number,pending_unit:r.unit,pending_entity:r.entity,pending_label:r.label,request_label:r.request_id?r.label:undefined,request_student:r.request_student||'',pending_from:r.previous_quantity,pending_to:r.current_quantity,pending_dates:r.current_dates,pending_at:new Date().toISOString(),pending_request:r.request_id||'',service_dates:r.service_dates});if(r.request_id){const request=app.findRecordById('lunch_requests',r.request_id);if(!request.getString('invoice_id')){request.set('invoice_id',target.id);require(__hooks+'/audit-lib.js').save(app,request,actor);}}}
 totals(app,target,lines,actor);return plain(target);
}
function remove(app,school,actor,body){
 const invoice=app.findRecordById('invoices',String(body.id||''));if(invoice.getString('daycare')!==school.id||invoice.getString('status')!=='draft')throw new Error('Choose a draft in this school.');
 const lines=JSON.parse(invoice.getString('lines')||'[]'),index=Number(body.index),line=lines[index];if(!Number.isInteger(index)||!line?.pending_source||String(body.token)!==JSON.stringify(line))throw new Error('This line changed. Refresh and try again.');
 lines.splice(index,1);
 if(line.pending_request&&!lines.some(l=>l.pending_request===line.pending_request)){const request=app.findRecordById('lunch_requests',line.pending_request);if(request.getString('invoice_id')===invoice.id){request.set('invoice_id','');require(__hooks+'/audit-lib.js').save(app,request,actor);}}
 totals(app,invoice,lines,actor);return plain(invoice);
}
function close(app,school,actor,body){
 const invoice=app.findRecordById('invoices',String(body.id||''));if(invoice.getString('daycare')!==school.id||!['draft','issued'].includes(invoice.getString('status')))throw new Error('Choose a saved invoice that is not already closed.');
 let reference=JSON.parse(invoice.getString('billing_snapshot')||'null');
 if(!reference){
  const old=JSON.parse(invoice.getString('daily_counts')||'[]'),p=calc.period(plain(invoice));if(!old.length)throw new Error('Recalculate and save before closing this invoice.');
  // Only legacy invoices without a saved per-student snapshot use aggregate comparisons.
  const units={};for(const day of old){const id=calc.key('school',day.rate);if(!units[id])units[id]={entity:'school',label:'School counts',rate:day.rate,quantity:0,dates:[]};units[id].quantity+=day.quantity;if(day.quantity)units[id].dates.push(day.date);}reference={version:1,...p,aggregate:true,units,start:p.start,end:p.end};
 }
 reference=require(__hooks+'/invoice-controls.js').adjustedReference(invoice,reference);
 calc.validateClose(plain(invoice),reference);
 reference.requests={};for(const line of JSON.parse(invoice.getString('lines')||'[]').filter(l=>l.request_id&&!l.pending_source)){
  const r=app.findRecordById('lunch_requests',line.request_id);reference.requests[calc.key('request:'+r.id,line.rate)]={entity:'request:'+r.id,label:r.getString('student_label'),rate:line.rate,quantity:line.quantity,dates:[r.getString('service_date')],request_id:r.id};
 }
 invoice.set('closed_snapshot',{version:1,closed_at:new Date().toISOString(),closed_by:actor.id,reference});invoice.set('status','closed');invoice.set('shared',true);require(__hooks+'/audit-lib.js').save(app,invoice,actor);return plain(invoice);
}
function ensure(app){
 app.runInTransaction(tx=>{
  const c=tx.findCollectionByNameOrId('invoices');let changed=false;
  for(const name of ['billing_snapshot','closed_snapshot','removed_adjustments'])if(!c.fields.getByName(name)){c.fields.add(new JSONField({name,maxSize:5000000}));changed=true;}
  if(changed)tx.save(c);
  for(const [type,name,json]of [['lunch_requests','archived',false],['lunch_requests','billing_deferred',false],['daycares','invoice_adjustment_dismissals',true]]){const collection=tx.findCollectionByNameOrId(type);if(!collection.fields.getByName(name)){collection.fields.add(json?new JSONField({name,maxSize:5000000}):new BoolField({name}));tx.save(collection);}}
  require(__hooks+'/invoice-reference-recovery.js').recover(tx);
 });
}
function dismiss(app,school,actor,body){
 const selected=Array.isArray(body.items)?body.items:[body];
 if(!selected.length||selected.length>150||new Set(selected.map(x=>x.id)).size!==selected.length)throw new Error('Choose between 1 and 150 different pending adjustments.');
 const available=list(app,school),chosen=selected.map(value=>{const item=available.find(x=>x.id===value.id&&x.token===value.token);if(!item)throw new Error('An adjustment changed. Refresh and review the group again. Nothing was dismissed.');return item;});
 const hidden=(JSON.parse(school.getString('invoice_adjustment_dismissals')||'null')||{});
 for(const item of chosen){
  if(item.source_kind==='draft'){const invoice=app.findRecordById('invoices',item.source_id),entries=require(__hooks+'/invoice-controls.js').removed(invoice);entries.find(x=>x.key===item.unit).dismissed=true;invoice.set('removed_adjustments',entries);require(__hooks+'/audit-lib.js').save(app,invoice,actor);}
  else hidden[item.id]=item.token;
 }
 school.set('invoice_adjustment_dismissals',hidden);app.save(school);
 return {message:'Adjustment dismissed. It stays hidden unless its underlying lunch or schedule changes.'};
}
function currentValues(app,school){
 const d=data(app,school),values={};
 for(const source of d.invoices.filter(i=>i.status==='closed'&&i.closed_snapshot?.reference&&!i.closed_snapshot.reference.correction_only)){
  const ref=source.closed_snapshot.reference,current=calc.capture(d.school,d.history,d.menus,ref.start,ref.end);
  if(ref.aggregate){const units={};for(const u of Object.values(current.units)){const id=calc.key('school',u.rate);if(!units[id])units[id]={quantity:0};units[id].quantity+=u.quantity;}current.units=units;}
  const units={...current.units,...calc.requestUnits(ref,d.requests,d.school,d.history,d.menus)};
  for(const id of new Set([...Object.keys(ref.units||{}),...Object.keys(ref.requests||{}),...Object.keys(units)]))values[source.id+'::'+id]=Number(units[id]?.quantity||0);
 }
 return values;
}
function resetUndoDrafts(app,school,before,actor){
 const after=currentValues(app,school),changed=new Set([...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>Number(before[key]||0)!==Number(after[key]||0)));let removed=0;
 for(const invoice of app.findRecordsByFilter('invoices','daycare = {:school} && status = "draft"','',0,0,{school:school.id})){
  const lines=JSON.parse(invoice.getString('lines')||'[]'),affected=lines.filter(l=>l.pending_source&&changed.has(l.pending_source+'::'+l.pending_unit));if(!affected.length)continue;
  const remaining=lines.filter(l=>!affected.includes(l));
  for(const line of affected)if(line.pending_request&&!remaining.some(l=>l.pending_request===line.pending_request)){
   const request=app.findRecordById('lunch_requests',line.pending_request);if(request.getString('invoice_id')===invoice.id){request.set('invoice_id','');require(__hooks+'/audit-lib.js').save(app,request,actor);}
  }
  removed+=affected.length;totals(app,invoice,remaining,actor);
 }
 return removed;
}
module.exports={totals,plain,data,snapshot,list,closedDate,notes,apply,remove,close,ensure,dismiss,currentValues,resetUndoDrafts};
