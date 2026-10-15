routerAdd('POST', '/api/substitution-legend', e => {
  if (!e.auth || !e.auth.getBool('active') || e.auth.getString('role') !== 'clc_admin') return e.json(403, { message: 'CLC admin access is required.' });
  const body = e.requestInfo().body || {}, code = String(body.code || ''), field = String(body.field || ''), value = String(body.value || '').trim();
  if (!['A','B','C','V'].includes(code) || !['name','description'].includes(field) || (field === 'name' && (!value || value.length > 40)) || (field === 'description' && value.length > 100)) return e.json(400, { message: 'Enter a label (1–40 characters) or description (up to 100 characters).' });
  try {
    // Deployments can reload hooks before migrations run on the next restart.
    const collection = $app.findCollectionByNameOrId('daycares');
    if (!collection.fields.getByName('sub_option_names')) { collection.fields.add(new JSONField({name:'sub_option_names',maxSize:2000})); $app.save(collection); }
    $app.runInTransaction(app => {
      const school = app.findRecordById('daycares', String(body.daycare || ''));
      if (field === 'name') {
        const names = JSON.parse(school.getString('sub_option_names') || '{}') || {};
        if (['A','B','C','V'].some(other => other !== code && String(names[other] || other).toLowerCase() === value.toLowerCase())) throw new Error('Each substitution label must be different.');
        names[code] = value; school.set('sub_option_names', names);
      } else school.set('sub_' + code.toLowerCase() + '_label', value);
      require(__hooks+'/audit-lib.js').save(app, school, e.auth);
    });
    return e.json(200, { message: 'Saved' });
  } catch (error) { return e.json(400, { message: String(error).includes('Each substitution label') ? 'Each substitution label must be different.' : 'Could not save the substitution legend. Please try again.' }); }
});
