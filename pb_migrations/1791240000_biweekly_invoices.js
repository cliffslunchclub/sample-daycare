migrate(app=>{
 const schools=app.findCollectionByNameOrId('daycares');schools.fields.add(new TextField({name:'billing_anchor',max:10}));app.save(schools);
 const invoices=app.findCollectionByNameOrId('invoices');
 for(const name of ['billing_cycle','period_start','period_end','due_date'])invoices.fields.add(new TextField({name,max:10}));app.save(invoices);
},app=>{
 const schools=app.findCollectionByNameOrId('daycares');schools.fields.removeByName('billing_anchor');app.save(schools);
 const invoices=app.findCollectionByNameOrId('invoices');for(const name of ['billing_cycle','period_start','period_end','due_date'])invoices.fields.removeByName(name);app.save(invoices);
})
