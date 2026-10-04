routerAdd("GET", "/api/public-schools", (e) => {
  try {
    const schools = $app.findRecordsByFilter("daycares", "active = true", "name", 200, 0)
    return e.json(200, schools.map((school) => ({ name: school.getString("name"), public_slug: school.getString("public_slug") })))
  } catch (err) {
    return e.json(500, { message: "Could not load schools." })
  }
})

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
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(date + "T12:00:00Z").getUTCDay()]
  if (!["Monday","Tuesday","Wednesday","Thursday","Friday"].includes(weekday) || !daycareId || !studentId || !date || !["A", "B", "C", "V"].includes(code)) {
    return e.json(400, { message: "Daycare, student, date, and a substitution option are required." })
  }
  try {
    const daycare = $app.findRecordById("daycares", daycareId)
    if (!daycare.getBool("allow_substitutions")) {
      return e.json(403, { message: "Substitutions are disabled for this daycare." })
    }
    if (e.auth.getString("role") !== "clc_admin") {
      if (e.auth.getString("role") !== "daycare_admin" || e.auth.getString("daycare") !== daycareId) {
        return e.json(403, { message: "Daycare access denied." })
      }
    }
    const student = $app.findRecordById("students", studentId)
    if (student.getString("daycare") !== daycareId) return e.json(400, { message: "Student and daycare do not match." })
    try {
      $app.findFirstRecordByFilter("substitutions", "student = {:student} && weekday = {:weekday} && recurring = true", { student: studentId, weekday })
      return e.json(409, { message: "A recurring substitution already exists for this student and weekday. Remove it before adding a replacement." })
    } catch (err) {}
    const record = new Record($app.findCollectionByNameOrId("substitutions"))
    record.set("daycare", daycareId)
    record.set("student", studentId)
    record.set("service_date", date)
    record.set("weekday", weekday)
    record.set("recurring", true)
    record.set("pizza_substitution", weekday === "Friday" && body.pizza_substitution === true)
    record.set("code", code)
    record.set("note", String(body.note || "").trim())
    $app.save(record)
    return e.json(201, { id: record.id })
  } catch (err) {
    return e.json(400, { message: "Could not save substitution." })
  }
})

routerAdd("POST", "/api/move-students", (e) => {
  if (!e.auth || !e.auth.getBool("active")) return e.json(403, { message: "Please sign in." })
  const body = e.requestInfo().body || {}
  const schoolId = String(body.daycare || "")
  const classroomId = String(body.classroom || "")
  const ids = Array.isArray(body.students) ? [...new Set(body.students.map(String))] : []
  if (!schoolId || !classroomId || !ids.length || ids.length > 500) return e.json(400, { message: "Choose a classroom and between 1 and 500 students." })
  const isClc = e.auth.getString("role") === "clc_admin"
  if (!isClc && (e.auth.getString("role") !== "daycare_admin" || e.auth.getString("daycare") !== schoolId)) return e.json(403, { message: "School access is required." })
  try {
    $app.runInTransaction((tx) => {
      const school = tx.findRecordById("daycares", schoolId)
      if (!isClc && !school.getBool("operations_enabled")) throw new Error("School roster tools are disabled.")
      const classroom = tx.findRecordById("classrooms", classroomId)
      if (classroom.getString("daycare") !== schoolId || !classroom.getBool("active")) throw new Error("Choose an active classroom in this school.")
      const students = ids.map((id) => tx.findRecordById("students", id))
      for (const student of students) if (student.getString("daycare") !== schoolId) throw new Error("Every selected student must belong to this school.")
      for (const student of students) { student.set("classroom", classroomId); tx.save(student) }
    })
    return e.json(200, { moved: ids.length })
  } catch (_) { return e.json(400, { message: "No students were moved. Check that all students and the destination classroom belong to this school and roster access is enabled." }) }
})
