migrate((app) => {
  const scopedRead = '@request.auth.id != "" && @request.auth.active = true && (@request.auth.role = "clc_admin" || daycare = @request.auth.daycare)'
  const scopedCreate = '@request.auth.id != "" && @request.auth.active = true && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && @request.body.daycare = @request.auth.daycare))'
  const scopedWrite = '@request.auth.id != "" && @request.auth.active = true && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && @request.body.daycare = @request.auth.daycare))'

  for (const name of ["classrooms", "students"]) {
    const collection = app.findCollectionByNameOrId(name)
    collection.listRule = scopedRead
    collection.viewRule = scopedRead
    collection.createRule = scopedCreate
    collection.updateRule = scopedWrite
    collection.deleteRule = scopedRead
    app.save(collection)
  }

  const substitutions = app.findCollectionByNameOrId("substitutions")
  substitutions.listRule = scopedRead
  substitutions.viewRule = scopedRead
  substitutions.createRule = '@request.auth.role = "clc_admin" || (@request.auth.active = true && @request.auth.role = "daycare_admin" && @request.body.daycare = @request.auth.daycare)'
  substitutions.updateRule = scopedWrite
  substitutions.deleteRule = scopedRead
  app.save(substitutions)

  const menuDays = app.findCollectionByNameOrId("menu_days")
  menuDays.listRule = 'published = true || ' + scopedRead
  menuDays.viewRule = 'published = true || ' + scopedRead
  menuDays.createRule = '@request.auth.role = "clc_admin" && @request.auth.active = true'
  menuDays.updateRule = '@request.auth.role = "clc_admin" && @request.auth.active = true'
  menuDays.deleteRule = '@request.auth.role = "clc_admin" && @request.auth.active = true'
  app.save(menuDays)

  const billingNotes = app.findCollectionByNameOrId("billing_notes")
  billingNotes.listRule = scopedRead
  billingNotes.viewRule = scopedRead
  billingNotes.createRule = '@request.auth.active = true && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && @request.body.daycare = @request.auth.daycare && @request.body.adjustment_units = 0))'
  billingNotes.updateRule = '@request.auth.active = true && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && @request.body.daycare = @request.auth.daycare && adjustment_units = 0 && @request.body.adjustment_units = 0))'
  billingNotes.deleteRule = '@request.auth.active = true && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && adjustment_units = 0))'
  app.save(billingNotes)
}, (app) => {
  // Keep the prior rules on rollback; this migration only repairs the expanded relation rule.
})
