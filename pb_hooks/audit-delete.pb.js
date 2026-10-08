routerAdd('POST','/api/audit-log/delete',e=>{
 if(!e.auth||!e.auth.getBool('active')||e.auth.getString('role')!=='clc_admin')return e.json(403,{message:'CLC superadmin access is required.'});
 const id=String(e.requestInfo().body?.id||'');if(!/^[a-z0-9]{15}$/.test(id))return e.json(400,{message:'Choose a valid audit record.'});
 try{require(__hooks+'/audit-delete-lib.js').remove(e.app,id);return e.json(200,{deleted:true});}catch(err){return e.json(400,{message:String(err.message||'Could not delete this audit record.')});}
});
