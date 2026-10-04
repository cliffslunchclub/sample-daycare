migrate((app) => {
  const clc = '@request.auth.active = true && @request.auth.role = "clc_admin"'
  const scoped = '@request.auth.active = true && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare))'
  const school = app.findCollectionByNameOrId('daycares')
  school.fields.add(new NumberField({ name: 'invoice_rate', min: 0, max: 1000 }))
  school.fields.add(new TextField({ name: 'billing_effective_date', max: 10 }))
  app.save(school)
  const students = app.findCollectionByNameOrId('students')
  students.fields.add(new TextField({ name: 'billing_effective_date', max: 10 }))
  app.save(students)
  const relation = () => ({ type: 'relation', name: 'daycare', collectionId: school.id, maxSelect: 1, required: true })
  const collections = [
    { name: 'schedule_history', indexes: ['CREATE UNIQUE INDEX idx_schedule_version ON schedule_history (daycare, entity, effective_date)'], listRule: scoped, viewRule: scoped, fields: [relation(), { type: 'text', name: 'entity', required: true }, { type: 'text', name: 'effective_date', required: true }, { type: 'json', name: 'snapshot', maxSize: 50000 }] },
    { name: 'lunch_requests', listRule: scoped, viewRule: scoped, fields: [relation(), { type: 'text', name: 'kind' }, { type: 'text', name: 'student' }, { type: 'text', name: 'student_label', max: 160 }, { type: 'text', name: 'classroom_label', max: 160 }, { type: 'text', name: 'service_date', max: 10 }, { type: 'text', name: 'size' }, { type: 'text', name: 'code' }, { type: 'text', name: 'note', max: 4000 }, { type: 'text', name: 'status' }, { type: 'text', name: 'created_by' }, { type: 'text', name: 'response', max: 4000 }, { type: 'text', name: 'invoice_id' }] },
    { name: 'invoices', listRule: clc + ' || (@request.auth.active = true && @request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && status = "issued")', viewRule: clc + ' || (@request.auth.active = true && @request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && status = "issued")', fields: [relation(), { type: 'text', name: 'number', required: true, max: 80 }, { type: 'text', name: 'month', required: true }, { type: 'text', name: 'invoice_date', required: true }, { type: 'text', name: 'school_name' }, { type: 'text', name: 'status' }, { type: 'text', name: 'notes', max: 10000 }, { type: 'json', name: 'lines', maxSize: 200000 }, { type: 'json', name: 'daily_counts', maxSize: 200000 }, { type: 'number', name: 'subtotal_cents' }, { type: 'number', name: 'tax_cents' }, { type: 'number', name: 'total_cents' }] },
    { name: 'invoice_flags', listRule: scoped, viewRule: scoped, fields: [relation(), { type: 'relation', name: 'invoice', collectionId: '', maxSelect: 1 }, { type: 'text', name: 'message', max: 4000 }, { type: 'text', name: 'response', max: 4000 }, { type: 'text', name: 'status' }, { type: 'text', name: 'created_by' }] },
  ]
  for (const config of collections) {
    if (config.name === 'invoice_flags') config.fields[1].collectionId = app.findCollectionByNameOrId('invoices').id
    app.save(new Collection({ type: 'base', ...config, createRule: null, updateRule: null, deleteRule: null }))
  }
  const date = new Date().toISOString().slice(0, 7) + '-01'
  for (const row of app.findAllRecords('daycares')) {
    const rate = row.getString('public_slug') === 'tle-englewood-cliffs' ? 3.5 : 4
    row.set('invoice_rate', rate); row.set('billing_effective_date', date); app.save(row)
    const found = app.findRecordsByFilter('schedule_history', 'daycare = {:daycare} && entity = {:entity} && effective_date = {:date}', '', 1, 0, { daycare: row.collection().name === 'daycares' ? row.id : row.getString('daycare'), entity: row.collection().name === 'daycares' ? 'school' : row.id, date })
    const history = found[0] || new Record(app.findCollectionByNameOrId('schedule_history'))
    history.set('daycare', row.id); history.set('entity', 'school'); history.set('effective_date', date)
    history.set('snapshot', { count_mode: row.getString('count_mode'), baseline_counts: JSON.parse(row.getString('baseline_counts')||'null'), clc_managed_counts: JSON.parse(row.getString('clc_managed_counts')||'null'), invoice_rate: rate })
    app.save(history)
  }
  for (const row of app.findAllRecords('students')) {
    const found = app.findRecordsByFilter('schedule_history', 'daycare = {:daycare} && entity = {:entity} && effective_date = {:date}', '', 1, 0, { daycare: row.collection().name === 'daycares' ? row.id : row.getString('daycare'), entity: row.collection().name === 'daycares' ? 'school' : row.id, date })
    const history = found[0] || new Record(app.findCollectionByNameOrId('schedule_history'))
    history.set('daycare', row.getString('daycare')); history.set('entity', row.id); history.set('effective_date', date)
    history.set('snapshot', { name: row.getString('name'), active: row.getBool('active'), service_days: JSON.parse(row.getString('service_days')||'null'), size: row.getString('size') }); app.save(history)
  }
}, (app) => {
  for (const name of ['invoice_flags', 'invoices', 'lunch_requests', 'schedule_history']) app.delete(app.findCollectionByNameOrId(name))
  for (const name of ['students','daycares']) { const c=app.findCollectionByNameOrId(name); c.fields.removeByName('billing_effective_date'); if(name==='daycares') c.fields.removeByName('invoice_rate'); app.save(c) }
})
