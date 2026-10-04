migrate((app) => {
  const collection = app.findCollectionByNameOrId('classrooms')
  collection.fields.add(new NumberField({ name: 'age_order', min: 0, onlyInt: true })); app.save(collection)
  const order = ['Mobiles Infants','Purple Cats','Khaki Kangaroo','Green Frogs','Goldfish','Yellow Ducks','Blue Horses','Brown Bears']
  for (const room of app.findRecordsByFilter('classrooms', '', 'name', 10000, 0)) {
    const index = order.indexOf(room.getString('name'))
    room.set('age_order', index >= 0 ? index + 1 : order.length + 1); app.save(room)
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId('classrooms'); collection.fields.removeByName('age_order'); app.save(collection)
})
