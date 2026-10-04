migrate((app) => {
  const items = new Collection({ type: 'base', name: 'menu_items', listRule: '@request.auth.role = "clc_admin"', viewRule: '@request.auth.role = "clc_admin"', createRule: '@request.auth.role = "clc_admin"', updateRule: '@request.auth.role = "clc_admin"', deleteRule: '@request.auth.role = "clc_admin"', fields: [{ type: 'text', name: 'name', required: true, max: 500 }, { type: 'bool', name: 'active' }] })
  app.save(items)
  const names = ['Grilled Chicken & Veggies\nSteamed Rice', 'Broccoli Butter Pasta\nGarlic Bread', 'Beef & Veggie Bolognese Pasta\nGarlic Bread', 'Chicken Nuggets\nTater Tots', 'Angus Beef Sliders\nFries', 'Chicken Penne alla Vodka\nPeas & Carrots', 'Bowtie Pasta with Peas & Meatballs', 'Bowtie Chicken Alfredo\nPeas & Carrots', 'Pizza', 'Pizza\nSweet Potato Fries', 'Breakfast for Lunch Day!', 'Fish Sticks & Veggies\nSteamed Rice']
  const itemIds = {}
  for (const name of names) { const item = new Record(items); item.set('name', name); item.set('active', true); app.save(item); itemIds[name] = item.id }
  const menus = app.findCollectionByNameOrId('menu_days')
  menus.fields.add(new RelationField({ name: 'menu_item', collectionId: items.id, maxSelect: 1 }))
  app.save(menus)
  // Correct only unchanged starter menus and create missing TLE dates. Keep saved staff edits.
  const rows = app.findRecordsByFilter('menu_days', 'service_date >= "2026-10-01 00:00:00.000Z" && service_date < "2026-11-01 00:00:00.000Z"', 'service_date', 500, 0)
  for (const row of rows) {
    const slug = row.getString('public_slug'); const date = row.getString('service_date').slice(0, 10); const name = row.getString('menu')
    if (slug === 'lightbridge-bergenfield' && name === 'Pizza\nSweet Potato Fries') row.set('menu', 'Pizza')
    if (slug === 'lightbridge-fort-lee' && date === '2026-10-05' && name === names[0]) row.set('menu', 'Breakfast for Lunch Day!')
    if (slug === 'lightbridge-fort-lee' && date === '2026-10-26' && name === names[0]) row.set('menu', 'Fish Sticks & Veggies\nSteamed Rice')
    row.set('menu_item', itemIds[row.getString('menu')] || '')
    app.save(row)
  }
  let tle
  try { tle = app.findFirstRecordByFilter('daycares', 'public_slug = "tle-englewood-cliffs"') } catch (_) { return }
  const bergenfield = app.findRecordsByFilter('menu_days', 'public_slug = "lightbridge-bergenfield" && service_date >= "2026-10-01 00:00:00.000Z" && service_date < "2026-11-01 00:00:00.000Z"', 'service_date', 100, 0)
  for (const source of bergenfield) {
    const date = source.getString('service_date')
    try { app.findFirstRecordByFilter('menu_days', 'daycare = {:id} && service_date = {:date}', { id: tle.id, date }); continue } catch (_) {}
    const row = new Record(menus); const friday = new Date(date.slice(0, 10) + 'T12:00:00Z').getUTCDay() === 5
    row.set('daycare', tle.id); row.set('daycare_name', tle.getString('name')); row.set('public_slug', tle.getString('public_slug')); row.set('service_date', date)
    row.set('menu', source.getString('menu')); row.set('menu_item', source.getString('menu_item')); row.set('closed', friday); row.set('published', true); row.set('pizza_count', 0); row.set('note', '')
    app.save(row)
  }
}, (app) => {
  const menus = app.findCollectionByNameOrId('menu_days'); menus.fields.removeByName('menu_item'); app.save(menus)
  app.delete(app.findCollectionByNameOrId('menu_items'))
})
