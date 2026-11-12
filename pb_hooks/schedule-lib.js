module.exports.capture=(app,row,deleted)=>{
  // During migrations the history collection may not exist yet.
  let collection;try{collection=app.findCollectionByNameOrId('schedule_history')}catch(_){return}
  const school=row.collection().name==='daycares', lib=require(__hooks+'/billing-lib.js'), today=lib.nyDate()
  const date=deleted?today:(row.getString('billing_effective_date')||today)
  if(!require(__hooks+'/billing-lib.js').validDate(date))throw new Error('A valid billing effective date is required.')
  const daycare=school?row.id:row.getString('daycare'),entity=school?'school':row.id
  const snapshot=school?{count_mode:row.getString('count_mode'),baseline_counts:JSON.parse(row.getString('baseline_counts')||'null'),clc_managed_counts:JSON.parse(row.getString('clc_managed_counts')||'null'),invoice_rate:row.getFloat('invoice_rate')}:{last_lunch_date:row.getString('last_lunch_date'),classroom:row.getString('classroom'),name:row.getString('name'),active:!deleted&&row.getBool('active'),service_days:JSON.parse(row.getString('service_days')||'null'),size:row.getString('size')}
  const existing=app.findRecordsByFilter('schedule_history','daycare = {:daycare} && entity = {:entity} && effective_date = {:date}','',1,0,{daycare,entity,date})
  const record=existing[0]||new Record(collection);record.set('daycare',daycare);record.set('entity',entity);record.set('effective_date',date);record.set('snapshot',snapshot);app.save(record)
  if(deleted){for(const future of app.findRecordsByFilter('schedule_history','daycare = {:daycare} && entity = {:entity} && effective_date > {:date}','',0,0,{daycare,entity,date})){const value=JSON.parse(future.getString('snapshot'));value.active=false;future.set('snapshot',value);app.save(future)}}
}
