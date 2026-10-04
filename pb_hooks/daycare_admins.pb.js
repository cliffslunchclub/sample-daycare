routerAdd("POST", "/api/daycare-admins", (e) => {
  if (!e.auth || !e.auth.getBool("active") || e.auth.getString("role") !== "clc_admin") {
    return e.json(403, { message: "CLC admin access is required." })
  }
  const body = e.requestInfo().body || {}
  const name = String(body.display_name || "").trim()
  const email = String(body.email || "").trim().toLowerCase()
  const password = String(body.password || "")
  const daycareId = String(body.daycare || "")
  if (!name || !email || password.length < 12 || !daycareId) {
    return e.json(400, { message: "Name, daycare, email, and a password of at least 12 characters are required." })
  }
  try {
    $app.findFirstRecordByFilter("users", "email = {:email}", { email })
    return e.json(400, { message: "An account with that email already exists." })
  } catch (err) {}
  try {
    $app.findRecordById("daycares", daycareId)
    const record = new Record($app.findCollectionByNameOrId("users"))
    record.set("email", email)
    record.set("password", password)
    record.set("passwordConfirm", password)
    record.set("emailVisibility", true)
    record.set("verified", true)
    record.set("role", "daycare_admin")
    record.set("daycare", daycareId)
    record.set("display_name", name)
    record.set("active", true)
    $app.save(record)
    return e.json(201, { id: record.id, message: "Daycare admin created." })
  } catch (err) {
    return e.json(400, { message: "Could not create the account. Check the email and daycare." })
  }
})

routerAdd("POST", "/api/substitutions", (e) => {
  if (!e.auth || !e.auth.getBool("active")) return e.json(403, { message: "Please sign in." })
  const body = e.requestInfo().body || {}
  const daycareId = String(body.daycare || "")
  const studentId = String(body.student || "")
  const date = String(body.service_date || "")
  const code = String(body.code || "")
  if (!daycareId || !studentId || !date || !["A", "B", "C", "V"].includes(code)) {
    return e.json(400, { message: "Daycare, student, date, and a substitution option are required." })
  }
  try {
    const daycare = $app.findRecordById("daycares", daycareId)
    if (e.auth.getString("role") !== "clc_admin") {
      if (e.auth.getString("role") !== "daycare_admin" || e.auth.getString("daycare") !== daycareId) {
        return e.json(403, { message: "Daycare access denied." })
      }
      if (!daycare.getBool("allow_substitutions")) return e.json(403, { message: "Substitutions are disabled for this daycare." })
    }
    const student = $app.findRecordById("students", studentId)
    if (student.getString("daycare") !== daycareId) return e.json(400, { message: "Student and daycare do not match." })
    try {
      $app.findFirstRecordByFilter("substitutions", "student = {:student} && service_date >= {:start} && service_date < {:end}", { student: studentId, start: date + " 00:00:00.000Z", end: date + " 23:59:59.999Z" })
      return e.json(409, { message: "A substitution is already recorded for this student and date." })
    } catch (err) {}
    const record = new Record($app.findCollectionByNameOrId("substitutions"))
    record.set("daycare", daycareId)
    record.set("student", studentId)
    record.set("service_date", date)
    record.set("code", code)
    record.set("note", String(body.note || "").trim())
    $app.save(record)
    return e.json(201, { id: record.id })
  } catch (err) {
    return e.json(400, { message: "Could not save substitution." })
  }
})
