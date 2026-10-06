migrate(app=>{
 const invoices=app.findCollectionByNameOrId('invoices');
 invoices.fields.add(new BoolField({name:'show_payment_terms'}));app.save(invoices);
 const schools=app.findRecordsByFilter('daycares','public_slug = "tle-englewood-cliffs"','',0,0);
 for(const school of schools){
  for(const invoice of app.findRecordsByFilter('invoices','daycare = {:school}','',0,0,{school:school.id})){
   invoice.set('show_payment_terms',true);app.save(invoice);
  }
 }
},app=>{
 const invoices=app.findCollectionByNameOrId('invoices');invoices.fields.removeByName('show_payment_terms');app.save(invoices);
});
