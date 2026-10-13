routerAdd('POST','/api/substitutions/{id}/edit',e=>{
  require(__hooks+'/substitution-edit.js').edit(e.app,e.auth,e.request.pathValue('id'),e.requestInfo().body || {});
  return e.json(200,{saved:true});
});
