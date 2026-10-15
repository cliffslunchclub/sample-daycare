migrate(app=>{
 const c=app.findCollectionByNameOrId('invoices');
 for(const name of ['billing_snapshot','closed_snapshot'])if(!c.fields.getByName(name))c.fields.add(new JSONField({name,maxSize:5000000}));
 app.save(c);
},_app=>{/* Retain closed references and billing history. */});
