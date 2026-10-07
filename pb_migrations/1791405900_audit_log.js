migrate(app=>{
  const scoped='@request.auth.active = true && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare != "" && daycare = @request.auth.daycare))';
  app.save(new Collection({type:'base',name:'audit_logs',listRule:scoped,viewRule:scoped,createRule:null,updateRule:null,deleteRule:null,indexes:['CREATE INDEX idx_audit_school_time ON audit_logs (daycare, occurred_at)'],fields:[
    {type:'text',name:'daycare'}, {type:'text',name:'school_name'}, {type:'text',name:'actor_id'}, {type:'text',name:'actor_name'}, {type:'text',name:'actor_email'}, {type:'text',name:'action'}, {type:'text',name:'entity_type'}, {type:'text',name:'entity_id'}, {type:'text',name:'entity_label'}, {type:'date',name:'occurred_at',required:true}, {type:'text',name:'effective_date'}, {type:'json',name:'changes',maxSize:1000000}
  ]}));
},_app=>{/* Keep audit history when rolling back application code. */});
