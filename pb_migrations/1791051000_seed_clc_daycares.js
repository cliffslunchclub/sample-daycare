const roster = [{"name":"Mobiles Infants","size":"small","students":[{"name":"Amenze","service_days":["Monday","Wednesday","Thursday"]},{"name":"Gia","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]}]},{"name":"Purple Cats","size":"small","students":[{"name":"Margo","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Ethan","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Nolan","service_days":["Monday","Wednesday","Friday"]},{"name":"Bilal","service_days":["Monday","Friday"]},{"name":"Lyla","service_days":["Friday"]},{"name":"Noah","service_days":["Friday"]}]},{"name":"Khaki Kangaroo","size":"small","students":[{"name":"Bianca","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Benny","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Viv","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]}]},{"name":"Green Frogs","size":"small","students":[{"name":"Ade","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Oliver","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]}]},{"name":"Goldfish","size":"small","students":[{"name":"Ethan","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Andres","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Lucas","service_days":["Friday"]},{"name":"Amjad","service_days":["Friday"]},{"name":"Starling","service_days":["Friday"]}]},{"name":"Yellow Ducks","size":"large","students":[{"name":"Jayla","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Leo Stern (veg)","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Damian","service_days":["Monday","Wednesday","Friday"]},{"name":"Eddie","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Zayn","service_days":["Tuesday","Wednesday","Thursday","Friday"]},{"name":"Gabby","service_days":["Friday"]},{"name":"Athena","service_days":["Friday"]},{"name":"Isabella","service_days":["Friday"]},{"name":"Mathias","service_days":["Friday"]},{"name":"Neveen","service_days":["Friday"]}]},{"name":"Blue Horses","size":"large","students":[{"name":"Evan","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Killian","service_days":["Monday","Wednesday","Thursday","Friday"]},{"name":"Madison","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]}]},{"name":"Brown Bears","size":"large","students":[{"name":"Rj","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Siena","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Charlotte W","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Kai","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Rael","service_days":["Monday","Tuesday","Wednesday","Thursday","Friday"]},{"name":"Emalina","service_days":["Friday"]},{"name":"Devaj","service_days":["Friday"]},{"name":"Luciano","service_days":["Friday"]}]}]

function findOne(app, collection, filter, params = {}) {
  try { return app.findFirstRecordByFilter(collection, filter, params) } catch (_) { return null }
}

function saveDaycare(app, collection, name, slug, settings) {
  let record = findOne(app, "daycares", "public_slug = {:slug}", { slug })
  if (!record && slug === "lightbridge-bergenfield") {
    record = findOne(app, "daycares", "public_slug = {:slug}", { slug: "sample-daycare" })
  }
  if (!record) record = new Record(collection)
  record.set("name", name)
  record.set("public_slug", slug)
  record.set("active", true)
  record.set("meal_price", 7.25)
  record.set("operations_enabled", settings.operations_enabled)
  record.set("baseline_counts", settings.baseline_counts)
  record.set("allow_substitutions", settings.allow_substitutions)
  record.set("sizes_enabled", settings.sizes_enabled)
  record.set("sub_a_label", "Chicken Nuggets with Roasted Veggies")
  record.set("sub_b_label", "Chicken & Rice with Roasted Veggies")
  record.set("sub_c_label", "Broccoli Butter Pasta with Garlic Bread")
  record.set("sub_v_label", "Vegetarian")
  app.save(record)
  return record
}

function saveMenuDay(app, collection, daycare, date, menu, pizzaCount) {
  const record = new Record(collection)
  record.set("daycare", daycare.id)
  record.set("daycare_name", daycare.get("name"))
  record.set("public_slug", daycare.get("public_slug"))
  record.set("service_date", `${date} 00:00:00.000Z`)
  record.set("menu", menu)
  record.set("note", "")
  record.set("closed", false)
  record.set("published", true)
  record.set("pizza_count", pizzaCount)
  app.save(record)
}

migrate((app) => {
  const daycares = app.findCollectionByNameOrId("daycares")
  daycares.fields.add(new BoolField({ name: "operations_enabled" }))
  daycares.fields.add(new JSONField({ name: "baseline_counts", maxSize: 256 }))
  app.save(daycares)

  const classrooms = app.findCollectionByNameOrId("classrooms")
  const students = app.findCollectionByNameOrId("students")
  const menuDays = app.findCollectionByNameOrId("menu_days")
  const users = app.findCollectionByNameOrId("users")

  // Enforce each school's operations toggle at the API boundary, including old sessions.
  const operationAccess = '@request.auth.role = "clc_admin" || (@request.auth.role = "daycare_admin" && daycare = @request.auth.daycare && daycare.operations_enabled = true)'
  for (const name of ["classrooms", "students", "substitutions", "billing_notes"]) {
    const collection = app.findCollectionByNameOrId(name)
    collection.listRule = operationAccess
    collection.viewRule = operationAccess
    collection.createRule = operationAccess
    collection.updateRule = operationAccess
    collection.deleteRule = operationAccess
    app.save(collection)
  }

  menuDays.listRule = 'published = true || ' + operationAccess
  menuDays.viewRule = 'published = true || ' + operationAccess
  menuDays.createRule = '@request.auth.role = "clc_admin"'
  menuDays.updateRule = '@request.auth.role = "clc_admin"'
  menuDays.deleteRule = '@request.auth.role = "clc_admin"'
  app.save(menuDays)

  const bergenfield = saveDaycare(app, daycares, "Lightbridge Bergenfield", "lightbridge-bergenfield", {
    operations_enabled: true,
    baseline_counts: {},
    allow_substitutions: true,
    sizes_enabled: true,
  })
  const fortLee = saveDaycare(app, daycares, "Lightbridge Fort Lee", "lightbridge-fort-lee", {
    operations_enabled: false,
    baseline_counts: { Monday: 64, Tuesday: 64, Wednesday: 64, Thursday: 64, Friday: 62 },
    allow_substitutions: false,
    sizes_enabled: false,
  })
  saveDaycare(app, daycares, "TLE Englewood Cliffs", "tle-englewood-cliffs", {
    operations_enabled: false,
    baseline_counts: { Monday: 120, Tuesday: 120, Wednesday: 120, Thursday: 120, Friday: 0 },
    allow_substitutions: false,
    sizes_enabled: false,
  })

  // Keep the local demo login usable as the CLC super admin after upgrading an existing local database.
  const admin = findOne(app, "users", "email = {:email}", { email: "admin@example.test" })
  if (admin) {
    admin.set("role", "clc_admin")
    admin.set("daycare", "")
    admin.set("display_name", "CLC Super Admin")
    admin.set("active", true)
    app.save(admin)
  }

  // Remove only the three synthetic starter records before loading the real Bergenfield classroom list.
  for (const sampleName of ["Avery Demo", "Jordan Demo", "Riley Demo"]) {
    const sample = findOne(app, "students", "name = {:name} && daycare = {:daycare}", { name: sampleName, daycare: bergenfield.id })
    if (sample) app.delete(sample)
  }
  const oldRoom = findOne(app, "classrooms", "name = {:name} && daycare = {:daycare}", { name: "Preschool", daycare: bergenfield.id })
  if (oldRoom) app.delete(oldRoom)

  for (const classroomData of roster) {
    let classroom = findOne(app, "classrooms", "name = {:name} && daycare = {:daycare}", { name: classroomData.name, daycare: bergenfield.id })
    if (!classroom) classroom = new Record(classrooms)
    classroom.set("name", classroomData.name)
    classroom.set("daycare", bergenfield.id)
    classroom.set("active", true)
    app.save(classroom)
    for (const studentData of classroomData.students) {
      let student = findOne(app, "students", "name = {:name} && classroom = {:classroom}", { name: studentData.name, classroom: classroom.id })
      if (!student) student = new Record(students)
      student.set("name", studentData.name)
      student.set("classroom", classroom.id)
      student.set("daycare", bergenfield.id)
      student.set("size", classroomData.size)
      student.set("service_days", studentData.service_days)
      student.set("active", true)
      app.save(student)
    }
  }

  const octoberMenu = [
    ["2026-10-01", "Chicken Penne alla Vodka\nPeas & Carrots", 0],
    ["2026-10-02", "Pizza\nSweet Potato Fries", 12],
    ["2026-10-05", "Grilled Chicken & Veggies\nSteamed Rice", 0],
    ["2026-10-06", "Broccoli Butter Pasta\nGarlic Bread", 0],
    ["2026-10-07", "Chicken Nuggets\nTater Tots", 0],
    ["2026-10-08", "Bowtie Pasta with Peas & Meatballs", 0],
    ["2026-10-09", "Pizza\nSweet Potato Fries", 0],
    ["2026-10-12", "Grilled Chicken & Veggies\nSteamed Rice", 0],
    ["2026-10-13", "Beef & Veggie Bolognese Pasta\nGarlic Bread", 0],
    ["2026-10-14", "Chicken Nuggets\nTater Tots", 0],
    ["2026-10-15", "Bowtie Chicken Alfredo\nPeas & Carrots", 0],
    ["2026-10-16", "Pizza\nSweet Potato Fries", 0],
    ["2026-10-19", "Grilled Chicken & Veggies\nSteamed Rice", 0],
    ["2026-10-20", "Broccoli Butter Pasta\nGarlic Bread", 0],
    ["2026-10-21", "Chicken Nuggets\nTater Tots", 0],
    ["2026-10-22", "Bowtie Pasta with Peas & Meatballs", 0],
    ["2026-10-23", "Pizza\nSweet Potato Fries", 0],
    ["2026-10-26", "Grilled Chicken & Veggies\nSteamed Rice", 0],
    ["2026-10-27", "Beef & Veggie Bolognese Pasta\nGarlic Bread", 0],
    ["2026-10-28", "Chicken Nuggets\nTater Tots", 0],
    ["2026-10-29", "Chicken Penne alla Vodka\nPeas & Carrots", 0],
    ["2026-10-30", "Pizza\nSweet Potato Fries", 0],
  ]
  for (const [date, menu, bergenfieldPizza] of octoberMenu) {
    saveMenuDay(app, menuDays, bergenfield, date, menu, bergenfieldPizza)
    saveMenuDay(app, menuDays, fortLee, date, menu, date === "2026-10-02" ? 21 : 0)
  }
}, (app) => {
  const daycares = app.findCollectionByNameOrId("daycares")
  for (const field of ["operations_enabled", "baseline_counts"]) {
    try { daycares.fields.removeByName(field) } catch (_) {}
  }
  app.save(daycares)
})
