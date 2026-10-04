migrate((app) => {
  const schools = app.findCollectionByNameOrId('daycares')
  schools.fields.add(new JSONField({ name: 'clc_managed_counts', maxSize: 1000 })); app.save(schools)
  try {
    const fortLee = app.findFirstRecordByFilter('daycares', 'public_slug = "lightbridge-fort-lee"')
    const existing = JSON.parse(fortLee.getString('baseline_counts') || '{}')
    const counts = { Friday: Number(existing.Friday || 0) }
    const managed = {}
    for (const day of ['Monday','Tuesday','Wednesday','Thursday']) { managed[day] = 2; counts[day] = Math.max(0, Number(existing[day] || 0) - 2) }
    managed.Friday = 0
    fortLee.set('baseline_counts', counts); fortLee.set('clc_managed_counts', managed); app.save(fortLee)
  } catch (_) {}
  const collection = app.findCollectionByNameOrId('substitutions')
  collection.fields.add(new BoolField({ name: 'recurring' }))
  collection.fields.add(new BoolField({ name: 'pizza_substitution' }))
  collection.fields.add(new SelectField({ name: 'weekday', values: ['Monday','Tuesday','Wednesday','Thursday','Friday'], maxSelect: 1 }))
  app.save(collection)
  const seen = {}
  for (const row of app.findRecordsByFilter('substitutions', '', '-service_date', 10000, 0)) {
    const day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(row.getString('service_date').slice(0,10) + 'T12:00:00Z').getUTCDay()]
    if (day === 'Saturday' || day === 'Sunday') continue
    const key = row.getString('student') + ':' + day
    row.set('weekday', day); row.set('recurring', !seen[key]); seen[key] = true; app.save(row)
  }
  let school
  try { school = app.findFirstRecordByFilter('daycares', 'public_slug = "lightbridge-bergenfield"') } catch (_) { return }
  const students = app.findRecordsByFilter('students', 'daycare = {:school}', '', 1000, 0, { school: school.id })
  const plan = [
    ['Monday', 'Margo', 'V'], ['Monday', 'Rj', 'C'], ['Monday', 'Charlotte W', 'A'], ['Monday', 'Leo Stern (veg)', 'V'], ['Monday', 'Killian', 'C'],
    ['Tuesday', 'Andres', 'B'], ['Tuesday', 'Jayla', 'A'], ['Tuesday', 'Margo', 'V'], ['Tuesday', 'Viv', 'B'], ['Tuesday', 'Rj', 'C'], ['Tuesday', 'Leo Stern (veg)', 'V'],
    ['Wednesday', 'Margo', 'V'], ['Wednesday', 'Andres', 'B'], ['Wednesday', 'Rj', 'C'], ['Wednesday', 'Kai', 'B'], ['Wednesday', 'Leo Stern (veg)', 'V'],
    ['Thursday', 'Margo', 'V'], ['Thursday', 'Andres', 'B'], ['Thursday', 'Charlotte W', 'A'], ['Thursday', 'Rj', 'C'], ['Thursday', 'Leo Stern (veg)', 'V'], ['Thursday', 'Evan', 'B'],
    ['Friday', 'Jayla', 'B'], ['Friday', 'Benny', 'B'], ['Friday', 'Rj', 'C', true],
  ]
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday']
  for (const [day, name, code, pizza] of plan) {
    const student = students.find((s) => s.getString('name').toLowerCase() === name.toLowerCase()); if (!student) continue
    if (seen[student.id + ':' + day]) continue
    const row = new Record(collection); row.set('daycare', school.id); row.set('student', student.id); row.set('weekday', day); row.set('recurring', true); row.set('pizza_substitution', Boolean(pizza)); row.set('service_date', `2026-10-${String(5 + days.indexOf(day)).padStart(2,'0')} 00:00:00.000Z`); row.set('code', code); app.save(row)
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId('substitutions'); for (const field of ['weekday','recurring','pizza_substitution']) collection.fields.removeByName(field); app.save(collection)
  const schools = app.findCollectionByNameOrId('daycares'); schools.fields.removeByName('clc_managed_counts'); app.save(schools)
})
