migrate(app=>{
 for(const [type,name,json]of [['invoices','removed_adjustments',true],['daycares','invoice_adjustment_dismissals',true],['lunch_requests','archived',false],['lunch_requests','billing_deferred',false]]){
  const c=app.findCollectionByNameOrId(type);if(!c.fields.getByName(name)){c.fields.add(json?new JSONField({name,maxSize:5000000}):new BoolField({name}));app.save(c);}
 }
},_app=>{/* Retain archive and billing decisions. */});
