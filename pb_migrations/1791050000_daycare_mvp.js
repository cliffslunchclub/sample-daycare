migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new SelectField({ name: "role", values: ["clc_admin", "daycare_admin"], maxSelect: 1 }))
  users.fields.add(new RelationField({ name: "daycare", collectionId: "", maxSelect: 1 }))
  users.fields.add(new TextField({ name: "display_name", max: 120 }))
  users.fields.add(new BoolField({ name: "active" }))

  const daycares = new Collection({
    type: "base", name: "daycares",
    listRule: '@request.auth.id != "" && (@request.auth.role = "clc_admin" || id = @request.auth.daycare)',
    viewRule: '@request.auth.id != "" && (@request.auth.role = "clc_admin" || id = @request.auth.daycare)',
    createRule: '@request.auth.role = "clc_admin"',
    updateRule: '@request.auth.role = "clc_admin"', deleteRule: '@request.auth.role = "clc_admin"',
    fields: [
      { type: "text", name: "name", required: true, max: 160 },
      { type: "text", name: "public_slug", required: true, max: 80 },
      { type: "bool", name: "active" },
      { type: "bool", name: "allow_substitutions" },
      { type: "bool", name: "sizes_enabled" },
      { type: "number", name: "meal_price", min: 0, max: 100 },
      { type: "text", name: "sub_a_label", max: 100 },
      { type: "text", name: "sub_b_label", max: 100 },
      { type: "text", name: "sub_c_label", max: 100 },
      { type: "text", name: "sub_v_label", max: 100 },
    ],
  })
  app.save(daycares)
  const daycareId = daycares.id
  const daycareRelation = users.fields.getByName("daycare")
  daycareRelation.collectionId = daycareId
  users.listRule = '@request.auth.id != "" && (@request.auth.role = "clc_admin" || id = @request.auth.id || daycare = @request.auth.daycare)'
  users.viewRule = users.listRule
  users.createRule = '@request.auth.role = "clc_admin"'
  users.updateRule = '@request.auth.role = "clc_admin" || (id = @request.auth.id && @request.body.role:isset = false && @request.body.daycare:isset = false && @request.body.active:isset = false)'
  users.deleteRule = '@request.auth.role = "clc_admin"'
  users.authRule = 'active = true'
  app.save(users)

  const scopedRead = '@request.auth.id != "" && (@request.auth.role = "clc_admin" || daycare = @request.auth.daycare)'
  const scopedCreate = '@request.auth.id != "" && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && @request.body.daycare = @request.auth.daycare))'
  const scopedWrite = '@request.auth.id != "" && (@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && @request.body.daycare = @request.auth.daycare))'

  const classrooms = new Collection({
    type: "base", name: "classrooms", listRule: scopedRead, viewRule: scopedRead,
    createRule: scopedCreate, updateRule: scopedWrite, deleteRule: scopedRead,
    fields: [
      { type: "text", name: "name", required: true, max: 100 },
      { type: "relation", name: "daycare", required: true, collectionId: daycareId, maxSelect: 1 },
      { type: "bool", name: "active" },
    ],
  })
  app.save(classrooms)
  const classroomId = classrooms.id

  const students = new Collection({
    type: "base", name: "students", listRule: scopedRead, viewRule: scopedRead,
    createRule: scopedCreate, updateRule: scopedWrite, deleteRule: scopedRead,
    fields: [
      { type: "text", name: "name", required: true, max: 150 },
      { type: "relation", name: "classroom", required: true, collectionId: classroomId, maxSelect: 1 },
      { type: "relation", name: "daycare", required: true, collectionId: daycareId, maxSelect: 1 },
      { type: "select", name: "size", values: ["standard", "small", "large"], maxSelect: 1 },
      { type: "json", name: "service_days", maxSize: 1000 },
      { type: "bool", name: "active" },
    ],
  })
  app.save(students)
  const studentsId = students.id

  const substitutions = new Collection({
    type: "base", name: "substitutions", listRule: scopedRead, viewRule: scopedRead,
    createRule: '@request.auth.role = "clc_admin"', updateRule: scopedWrite, deleteRule: scopedRead,
    fields: [
      { type: "relation", name: "student", required: true, collectionId: studentsId, maxSelect: 1 },
      { type: "relation", name: "daycare", required: true, collectionId: daycareId, maxSelect: 1 },
      { type: "date", name: "service_date", required: true },
      { type: "select", name: "code", required: true, values: ["A", "B", "C", "V"], maxSelect: 1 },
      { type: "text", name: "note", max: 250 },
    ],
  })
  app.save(substitutions)

  const menuDays = new Collection({
    type: "base", name: "menu_days", listRule: 'published = true || ' + scopedRead,
    viewRule: 'published = true || ' + scopedRead,
    createRule: '@request.auth.role = "clc_admin"', updateRule: '@request.auth.role = "clc_admin"', deleteRule: '@request.auth.role = "clc_admin"',
    fields: [
      { type: "relation", name: "daycare", required: true, collectionId: daycareId, maxSelect: 1 },
      { type: "text", name: "daycare_name", max: 160 },
      { type: "text", name: "public_slug", required: true, max: 80 },
      { type: "date", name: "service_date", required: true },
      { type: "text", name: "menu", max: 500 },
      { type: "text", name: "note", max: 300 },
      { type: "bool", name: "closed" },
      { type: "bool", name: "published" },
      { type: "number", name: "pizza_count", min: 0, max: 1000 },
    ],
  })
  app.save(menuDays)

  const billingNotes = new Collection({
    type: "base", name: "billing_notes", listRule: scopedRead, viewRule: scopedRead,
    createRule: '@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && @request.body.daycare = @request.auth.daycare && @request.body.adjustment_units = 0)',
    updateRule: '@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && @request.body.daycare = @request.auth.daycare && adjustment_units = 0 && @request.body.adjustment_units = 0)',
    deleteRule: '@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && adjustment_units = 0)',
    fields: [
      { type: "relation", name: "daycare", required: true, collectionId: daycareId, maxSelect: 1 },
      { type: "text", name: "month", required: true, max: 7 },
      { type: "text", name: "note", required: true, max: 500 },
      { type: "number", name: "adjustment_units", min: -10000, max: 10000 },
    ],
  })
  app.save(billingNotes)

  // The local-only CLC login is created when the database is first initialized.
  if ($os.getenv("DAYCARE_SEED_DEMO") === "false") return
  const daycare = new Record(daycares)
  daycare.set("name", "Sample Daycare")
  daycare.set("public_slug", "sample-daycare")
  daycare.set("active", true)
  daycare.set("allow_substitutions", true)
  daycare.set("sizes_enabled", true)
  daycare.set("meal_price", 7.25)
  daycare.set("sub_a_label", "Option A")
  daycare.set("sub_b_label", "Option B")
  daycare.set("sub_c_label", "Option C")
  daycare.set("sub_v_label", "Vegetarian")
  app.save(daycare)

  const classroom = new Record(classrooms)
  classroom.set("name", "Preschool")
  classroom.set("daycare", daycare.id)
  classroom.set("active", true)
  app.save(classroom)

  function seedStudent(name, size, serviceDays) {
    const student = new Record(students)
    student.set("name", name)
    student.set("classroom", classroom.id)
    student.set("daycare", daycare.id)
    student.set("size", size)
    student.set("service_days", serviceDays)
    student.set("active", true)
    app.save(student)
  }
  seedStudent("Avery Demo", "small", ["Monday", "Wednesday", "Friday"])
  seedStudent("Jordan Demo", "large", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
  seedStudent("Riley Demo", "standard", ["Tuesday", "Thursday"])

  const admin = new Record(users)
  admin.set("email", "admin@example.test")
  admin.set("password", "LocalLunch2026!")
  admin.set("passwordConfirm", "LocalLunch2026!")
  admin.set("emailVisibility", true)
  admin.set("verified", true)
  admin.set("role", "clc_admin")
  admin.set("display_name", "Demo CLC Admin")
  admin.set("active", true)
  app.save(admin)
}, (app) => {
  ;["billing_notes", "menu_days", "substitutions", "students", "classrooms", "daycares"].forEach((name) => {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (e) {}
  })
  try {
    const users = app.findCollectionByNameOrId("users")
    ;["role", "daycare", "display_name", "active"].forEach((name) => {
      try { users.fields.removeByName(name) } catch (e) {}
    })
    app.save(users)
  } catch (e) {}
})
