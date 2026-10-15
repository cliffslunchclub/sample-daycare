const webhookPattern=/^https:\/\/discord\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[A-Za-z0-9_-]{20,}\/?$/;
function validWebhook(value){return webhookPattern.test(String(value||''));}
function settings(app){try{return app.findRecordsByFilter('discord_audit_settings','id != ""','',1,0)[0]||null;}catch(_){return null;}}
function text(value){return String(value||'CLC / Shared').replace(/[@*_`~|<>]/g,'').slice(0,180);}
function payload(audits){
 const counts=Object.create(null);for(const audit of audits){const name=text(audit.getString('school_name'));counts[name]=(counts[name]||0)+1;}
 return {username:'CLC Preschool Audit',allowed_mentions:{parse:[]},embeds:[{title:'CLC activity update — '+audits.length+' '+(audits.length===1?'change':'changes'),color:0x5b8067,description:Object.keys(counts).sort().map(name=>name+': '+counts[name]).join('\n')}]};
}
function ensure(app){
 const collection=app.findCollectionByNameOrId('discord_audit_settings');if(!collection.fields.getByName('last_batch_hour')){collection.fields.add(new TextField({name:'last_batch_hour',max:20}));app.save(collection);}
}
function shouldNotify(audit){return !['invoices','invoice_flags'].includes(audit.getString('entity_type'));}
function enqueue(app,audit){if(!shouldNotify(audit))return;const config=settings(app);if(!config||!config.getBool('enabled')||!validWebhook(config.getString('webhook_url')))return;
 const row=new Record(app.findCollectionByNameOrId('discord_audit_outbox'));row.set('audit_id',audit.id);row.set('status','pending');row.set('next_attempt',new Date().toISOString());row.set('attempts',0);app.save(row);
}
function deliver(app,clock=new Date()){
 // UTC and Eastern share the same top-of-hour boundary, including DST changes.
 if(clock.getUTCMinutes()!==0)return;
 const config=settings(app);if(!config||!config.getBool('enabled')||!validWebhook(config.getString('webhook_url')))return;
 const now=clock.toISOString(),hour=now.slice(0,13),jobs=[],audits=[];let claimedConfig;
 app.runInTransaction(tx=>{
  const fresh=tx.findRecordById('discord_audit_settings',config.id);
  if(!fresh.getBool('enabled')||!validWebhook(fresh.getString('webhook_url'))||fresh.getString('last_batch_hour')===hour)return;
  const active=tx.findRecordsByFilter('discord_audit_outbox','status = "processing" && lease_until > {:now}','',1,0,{now});if(active.length)return;
  const candidates=tx.findRecordsByFilter('discord_audit_outbox','(status = "pending" && next_attempt <= {:now}) || (status = "processing" && lease_until <= {:now})','next_attempt,id',0,0,{now});
  for(const candidate of candidates){
   let audit;try{audit=tx.findRecordById('audit_logs',candidate.getString('audit_id'));}catch(_){}
   if(!audit||!shouldNotify(audit)){candidate.set('status','skipped');candidate.set('last_error','');tx.save(candidate);continue;}
   candidate.set('status','processing');candidate.set('lease_until',new Date(clock.getTime()+120000).toISOString());candidate.set('attempts',candidate.getInt('attempts')+1);tx.save(candidate);jobs.push(candidate);audits.push(audit);
  }
  if(!jobs.length)return;
  fresh.set('last_batch_hour',hour);tx.save(fresh);claimedConfig=fresh;
 });
 if(!jobs.length)return;
 let response;try{response=$http.send({url:claimedConfig.getString('webhook_url').replace(/\/$/,'')+'?wait=true',method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload(audits)),timeout:8});}catch(_){response={statusCode:0};}
 const status=Number(response.statusCode),success=status>=200&&status<300;
 const nextHour=Math.floor(clock.getTime()/3600000)*3600000+3600000;
 const retry=status===429?Math.max(nextHour,Math.ceil((clock.getTime()+Math.max(60,Math.min(86400,Number(response.json?.retry_after)||60))*1000)/3600000)*3600000):nextHour;
 app.runInTransaction(tx=>{
  for(const job of jobs){const current=tx.findRecordById('discord_audit_outbox',job.id);
   current.set('lease_until','');
   if(success){current.set('status','sent');current.set('sent_at',new Date().toISOString());current.set('message_id',String(response.json?.id||''));current.set('last_error','');}
   else{current.set('status','pending');current.set('last_error',status?'Discord returned HTTP '+status:'Discord delivery timed out or could not connect');current.set('next_attempt',new Date(retry).toISOString());}
   tx.save(current);
  }
  const fresh=tx.findRecordById('discord_audit_settings',claimedConfig.id);
  if([401,403,404].includes(status)){fresh.set('enabled',false);fresh.set('last_error','Discord rejected the webhook. Replace it and enable notifications again.');}
  else fresh.set('last_error',success?'':'Discord summary could not be delivered. Pending activity will retry at a later hourly run.');
  tx.save(fresh);
 });
}
module.exports={validWebhook,settings,payload,shouldNotify,enqueue,ensure,deliver};
