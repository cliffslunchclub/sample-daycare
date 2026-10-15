const webhookPattern=/^https:\/\/discord\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[A-Za-z0-9_-]{20,}\/?$/;
function validWebhook(value){return webhookPattern.test(String(value||''));}
function settings(app){try{return app.findRecordsByFilter('discord_audit_settings','id != ""','',1,0)[0]||null;}catch(_){return null;}}
const types={students:'Student',classrooms:'Classroom',daycares:'School Settings',substitutions:'Substitution',menu_days:'Menu Day',menu_items:'Menu Item',users:'Admin Account',lunch_requests:'Note / Lunch Request',invoices:'Invoice',invoice_flags:'Invoice Correction',school_notes:'School Note'};
const safeFields={students:['last_lunch_date','name','active','classroom','service_days','size','billing_effective_date'],classrooms:['name','active','meal_size','age_order'],daycares:['name','active','count_mode','baseline_counts','clc_managed_counts','invoice_rate','billing_effective_date','allow_substitutions','sizes_enabled','operations_enabled','billing_cycle','billing_anchor'],substitutions:['student','service_date','code','weekday'],menu_days:['service_date','menu','closed','published'],menu_items:['name','active'],users:['display_name','role','active','account_access'],lunch_requests:['kind','student_label','service_date','status','size','code','invoice_id'],invoices:['number','month','invoice_date','period_start','period_end','due_date','status','shared','show_payment_terms','subtotal_cents','tax_cents','total_cents'],invoice_flags:['status'],school_notes:[]};
function text(value){if(value===null||value===undefined||value==='')return '—';if(typeof value==='boolean')return value?'Yes':'No';if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value))value=value.slice(5,7)+'-'+value.slice(8,10)+'-'+value.slice(0,4);if(Array.isArray(value))return value.map(text).join(', ');if(typeof value==='object')return Object.entries(value).map(([k,v])=>k+': '+text(v)).join(', ');return String(value).replace(/[@*_`~|<>]/g,'').slice(0,900);}
function payload(audit){
  const type=audit.getString('entity_type'),changes=JSON.parse(audit.getString('changes')||'{}');
  const lines=[];for(const field of safeFields[type]||[]){if(!changes[field])continue;const change=changes[field];const show=v=>field.endsWith('_cents')&&v!==null?'$'+(Number(v)/100).toFixed(2):text(v);lines.push(field.replace(/_/g,' ')+': '+show(change.before)+' → '+show(change.after));}
  const protectedType=['invoice_flags','school_notes'].includes(type)||(type==='lunch_requests'&&changes.kind?.after==='note');
  const label=protectedType?types[type]:text(audit.getString('entity_label'));
  const effective=audit.getString('effective_date');
  return {username:'CLC Preschool Audit',allowed_mentions:{parse:[]},embeds:[{title:(types[type]||'School Activity')+' '+({create:'Created',update:'Updated',delete:'Deleted'}[audit.getString('action')]||'Changed'),color:0x5b8067,description:(text(audit.getString('school_name')||'CLC / Shared')+' · '+label).slice(0,1000),fields:[{name:'Changed by',value:text(audit.getString('actor_name')),inline:true},...(effective?[{name:'Effective date',value:text(effective),inline:true}]:[]),{name:'Changes',value:lines.length?lines.join('\n').slice(0,1024):'Details are available in the app’s Audit Log'}],footer:{text:'Audit ID: '+audit.id},timestamp:new Date(audit.getString('occurred_at')).toISOString()}]};
}
function shouldNotify(audit){return !['invoices','invoice_flags'].includes(audit.getString('entity_type'));}
function enqueue(app,audit){if(!shouldNotify(audit))return;const config=settings(app);if(!config||!config.getBool('enabled')||!validWebhook(config.getString('webhook_url')))return;
 const row=new Record(app.findCollectionByNameOrId('discord_audit_outbox'));row.set('audit_id',audit.id);row.set('status','pending');row.set('next_attempt',new Date().toISOString());row.set('attempts',0);app.save(row);
}
function deliver(app){
 const config=settings(app);if(!config||!config.getBool('enabled')||!validWebhook(config.getString('webhook_url')))return;
 const now=new Date().toISOString();const jobs=app.findRecordsByFilter('discord_audit_outbox','(status = "pending" && next_attempt <= {:now}) || (status = "processing" && lease_until <= {:now})','next_attempt',5,0,{now});
 for(const candidate of jobs){
  let job;app.runInTransaction(tx=>{const current=tx.findRecordById('discord_audit_outbox',candidate.id);const available=current.getString('status')==='pending'&&Date.parse(current.getString('next_attempt'))<=Date.parse(now)||current.getString('status')==='processing'&&Date.parse(current.getString('lease_until'))<=Date.parse(now);if(!available)return;current.set('status','processing');current.set('lease_until',new Date(Date.now()+120000).toISOString());current.set('attempts',current.getInt('attempts')+1);tx.save(current);job=current;});if(!job)continue;
  let audit;try{audit=app.findRecordById('audit_logs',job.getString('audit_id'));}catch(_){job.set('status','skipped');job.set('last_error','');app.save(job);continue;}
  if(!shouldNotify(audit)){job.set('status','skipped');job.set('last_error','');app.save(job);continue;}
  let response;try{response=$http.send({url:config.getString('webhook_url').replace(/\/$/,'')+'?wait=true',method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload(audit)),timeout:8});}catch(_){response={statusCode:0};}
  const status=Number(response.statusCode);
  if(status>=200&&status<300){job.set('status','sent');job.set('sent_at',new Date().toISOString());job.set('message_id',String(response.json?.id||''));job.set('last_error','');}
  else{let delay=Math.min(3600,60*Math.pow(2,Math.min(6,job.getInt('attempts')-1)));if(status===429)delay=Math.max(60,Math.min(86400,Math.ceil(Number(response.json?.retry_after)||60)));const error=status?'Discord returned HTTP '+status:'Discord delivery timed out or could not connect';job.set('status','pending');job.set('last_error',error);job.set('next_attempt',new Date(Date.now()+delay*1000).toISOString());if([401,403,404].includes(status)){config.set('enabled',false);config.set('last_error','Discord rejected the webhook. Replace it and enable notifications again.');app.save(config);}}
  app.save(job);if(status===429||[401,403,404].includes(status))break;
 }
}
module.exports={validWebhook,settings,payload,shouldNotify,enqueue,deliver};
