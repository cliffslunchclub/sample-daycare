routerAdd('POST','/api/weekly-roster',(e)=>{
 if(!e.auth||!e.auth.getBool('active'))return e.json(403,{message:'Please sign in.'});
 const role=e.auth.getString('role'),body=e.requestInfo().body||{},school=String(body.daycare||'');
 if(role!=='clc_admin'&&(role!=='daycare_admin'||e.auth.getString('daycare')!==school))return e.json(403,{message:'School access is required.'});
 try{let result;e.app.runInTransaction(tx=>{result=require(__hooks+'/weekly-roster-lib.js').build(tx,tx.findRecordById('daycares',school));});return e.json(200,result);}catch(_){return e.json(400,{message:'Could not load the current-week lunch roster. Refresh and try again.'});}
});
