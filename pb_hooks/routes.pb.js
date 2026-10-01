routerAdd('GET','/api/daycare/state',e=>{
 const service=require(__hooks+'/service.js');
 const record=e.app.findFirstRecordByData('workspace','key','main');
 e.response.header().set('Cache-Control','no-store');
 return e.json(200,service.context(e.app,JSON.parse(record.getString('data'))).scoped(service.safeUser(e.auth)));
},$apis.requireAuth('users'));
routerAdd('POST','/api/daycare/{action}',e=>{
 const service=require(__hooks+'/service.js');
 const action=e.request.pathValue('action'),body=e.requestInfo().body;
 e.app.runInTransaction(app=>{
   const record=app.findFirstRecordByData('workspace','key','main');
   const state=JSON.parse(record.getString('data'));
   service.context(app,state).dispatch(action,body,service.safeUser(e.auth));
   record.set('data',state);app.save(record);
 });
 return e.json(200,{ok:true});
},$apis.requireAuth('users'),$apis.bodyLimit(65536));
