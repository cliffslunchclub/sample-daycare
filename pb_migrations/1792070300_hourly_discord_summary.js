migrate(app=>{
 const c=app.findCollectionByNameOrId('discord_audit_settings');if(!c.fields.getByName('last_batch_hour')){c.fields.add(new TextField({name:'last_batch_hour',max:20}));app.save(c);}
},_app=>{/* Retain hourly delivery history. */});
