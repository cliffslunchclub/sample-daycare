migrate(app=>{
 const c=app.findCollectionByNameOrId('invoices');c.fields.add(new BoolField({name:'shared'}));
 const rule='@request.auth.active = true && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && (shared = true || status = "issued")))';
 c.listRule=rule;c.viewRule=rule;app.save(c);
},app=>{
 const c=app.findCollectionByNameOrId('invoices');c.fields.removeByName('shared');
 const rule='@request.auth.active = true && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && status = "issued"))';c.listRule=rule;c.viewRule=rule;app.save(c);
});
