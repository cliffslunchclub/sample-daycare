migrate(app => {
  const collection = app.findCollectionByNameOrId('daycares');
  if (!collection.fields.getByName('sub_option_names')) {
    collection.fields.add(new JSONField({name:'sub_option_names',maxSize:2000})); app.save(collection);
  }
}, _app => { /* Retain saved substitution labels. */ });
