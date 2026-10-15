routerAdd('POST','/api/audit-log/undo',e=>{
 if(!e.auth||!e.auth.getBool('active')||e.auth.getString('role')!=='clc_admin')return e.json(403,{message:'Only CLC superadmins can undo audit changes.'});
 try{return e.json(200,require(__hooks+'/audit-undo-lib.js').run(e.app,e.auth,e.requestInfo().body||{}));}catch(err){return e.json(400,{message:String(err.message||err)});}
});
