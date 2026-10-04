migrate((app) => {
  const schools = app.findCollectionByNameOrId('daycares')
  schools.fields.add(new SelectField({ name: 'count_mode', values: ['roster', 'manual'], maxSelect: 1, required: true }))
  schools.fields.add(new JSONField({ name: 'baseline_pizza_counts', maxSize: 1000 }))
  // Fill the required field before saving the schema with validation.
  schools.fields.getByName('count_mode').required = false
  app.save(schools)
  for (const school of app.findRecordsByFilter('daycares', '', '', 1000, 0)) {
    const slug = school.getString('public_slug')
    school.set('count_mode', slug === 'lightbridge-fort-lee' || slug === 'tle-englewood-cliffs' ? 'manual' : 'roster')
    school.set('baseline_pizza_counts', { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: slug === 'lightbridge-bergenfield' ? 12 : slug === 'lightbridge-fort-lee' ? 21 : 0 })
    app.save(school)
  }
  schools.fields.getByName('count_mode').required = true
  app.save(schools)
}, (app) => {
  const schools = app.findCollectionByNameOrId('daycares'); schools.fields.removeByName('count_mode'); schools.fields.removeByName('baseline_pizza_counts'); app.save(schools)
})
