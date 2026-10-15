routerAdd('GET','/api/discord-audit',(e)=>{
 if(!e.auth||!e.auth.getBool('active')||e.auth.getString('role')!=='clc_admin')return e.json(403,{message:'CLC access is required.'});
 const lib=require(__hooks+'/discord-audit-lib.js');lib.ensure(e.app);const config=lib.settings(e.app);let pending=0;try{pending=e.app.countRecords('discord_audit_outbox',$dbx.exp('[[status]] IN ({:pending}, {:processing})',{pending:'pending',processing:'processing'}));}catch(_){}
 return e.json(200,{configured:Boolean(config?.getString('webhook_url')),enabled:Boolean(config?.getBool('enabled')),error:config?.getString('last_error')||'',pending});
});
routerAdd('POST','/api/discord-audit',(e)=>{
 if(!e.auth||!e.auth.getBool('active')||e.auth.getString('role')!=='clc_admin')return e.json(403,{message:'CLC access is required.'});
 const lib=require(__hooks+'/discord-audit-lib.js'),body=e.requestInfo().body||{};
 try{let config=lib.settings(e.app);if(!config)config=new Record(e.app.findCollectionByNameOrId('discord_audit_settings'));
  const webhook=String(body.webhook_url||'').trim();if(webhook){if(!lib.validWebhook(webhook))return e.json(400,{message:'Use an HTTPS Discord webhook URL copied from the channel.'});config.set('webhook_url',webhook);}
  if(body.action==='test'){if(!lib.validWebhook(config.getString('webhook_url')))return e.json(400,{message:'Save a webhook first.'});const response=$http.send({url:config.getString('webhook_url').replace(/\/$/,'')+'?wait=true',method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'CLC Preschool Audit',content:'CLC hourly activity summaries are connected. Summaries include school totals only and are sent at the top of the hour when activity is pending.',allowed_mentions:{parse:[]}}),timeout:8});if(response.statusCode<200||response.statusCode>=300)return e.json(400,{message:'Discord could not accept the test message. Check the webhook and try again.'});return e.json(200,{message:'Test message sent.'});}
  if(body.action!=='save')return e.json(400,{message:'Unknown action.'});
  if(body.enabled&&!lib.validWebhook(config.getString('webhook_url')))return e.json(400,{message:'Add a webhook before enabling notifications.'});config.set('enabled',body.enabled===true);config.set('last_error','');e.app.save(config);return e.json(200,{message:'Discord settings saved.'});
 }catch(_){return e.json(400,{message:'Could not update Discord. Restart the backend after deployment, then try again.'});}
});
cronAdd('discord-preschool-audit','0 * * * *',()=>{try{const lib=require(__hooks+'/discord-audit-lib.js');lib.ensure($app);lib.deliver($app);}catch(_){$app.logger().error('Discord audit worker could not process the queue');}});
