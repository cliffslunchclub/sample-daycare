migrate((app) => {
  try {
    app.delete(app.findCollectionByNameOrId("billing_notes"))
  } catch (_) {}

  const daycares = app.findCollectionByNameOrId("daycares")
  try { daycares.fields.removeByName("meal_price") } catch (_) {}
  app.save(daycares)
}, (app) => {
  // Billing is deferred; rollback intentionally does not restore the removed collection.
})
