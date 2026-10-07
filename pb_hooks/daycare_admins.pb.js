routerAdd("GET", "/api/public-schools", (e) => {
  try {
    const schools = $app.findRecordsByFilter("daycares", "active = true", "name", 200, 0)
    return e.json(200, schools.map((school) => ({ name: school.getString("name"), public_slug: school.getString("public_slug"), substitution_options: school.getBool("allow_substitutions") ? { A: school.getString("sub_a_label"), B: school.getString("sub_b_label"), C: school.getString("sub_c_label"), V: school.getString("sub_v_label") } : null })))
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
  const accountId = String(body.id || "")
  if (!name || !email || (!accountId && password.length < 12) || (password && password.length < 12) || !daycareId) {
    return e.json(400, { message: "Name, daycare, email, and a password of at least 12 characters are required." })
  }
  try {
    const existing = $app.findFirstRecordByFilter("users", "email = {:email}", { email })
    if (existing.id !== accountId) return e.json(400, { message: "An account with that email already exists." })
  } catch (err) {}
  try {
    $app.findRecordById("daycares", daycareId)
    const record = accountId ? $app.findRecordById("users", accountId) : new Record($app.findCollectionByNameOrId("users"))
    if (accountId && record.getString("role") !== "daycare_admin") return e.json(403, { message: "Only school admin accounts can be edited here." })
    record.set("email", email)
    if (password) record.setPassword(password)
    record.set("emailVisibility", true)
    record.set("verified", true)
    record.set("role", "daycare_admin")
    record.set("daycare", daycareId)
    record.set("display_name", name)
    record.set("active", accountId ? body.active !== false : true)
    require(__hooks+'/audit-lib.js').save($app,record,e.auth,{credentialsChanged:Boolean(password)})
    return e.json(accountId ? 200 : 201, { id: record.id, message: accountId ? "School admin updated." : "School admin created." })
  } catch (err) {
    return e.json(400, { message: "Could not save the account. Check the email, school, and password (at least 12 characters)." })
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
    require(__hooks+'/audit-lib.js').save($app,record,e.auth)
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
      for (const student of students) { student.set("classroom", classroomId); student.set("billing_effective_date", require(__hooks+"/billing-lib.js").nyDate()); require(__hooks+'/audit-lib.js').save(tx,student,e.auth) }
    })
    return e.json(200, { moved: ids.length })
  } catch (_) { return e.json(400, { message: "No students were moved. Check that all students and the destination classroom belong to this school and roster access is enabled." }) }
})

routerAdd("POST", "/api/delete-students", (e) => {
  if (!e.auth || !e.auth.getBool("active")) return e.json(403, { message: "Please sign in." })
  const body = e.requestInfo().body || {}
  const schoolId = String(body.daycare || "")
  const ids = Array.isArray(body.students) ? [...new Set(body.students.map(String))] : []
  if (!schoolId || !ids.length || ids.length > 500) return e.json(400, { message: "Select between 1 and 500 students." })
  const isClc = e.auth.getString("role") === "clc_admin"
  if (!isClc && (e.auth.getString("role") !== "daycare_admin" || e.auth.getString("daycare") !== schoolId)) return e.json(403, { message: "School access is required." })
  try {
    $app.runInTransaction((tx) => {
      const school = tx.findRecordById("daycares", schoolId)
      if (!isClc && !school.getBool("operations_enabled")) throw new Error("School roster tools are disabled.")
      const students = ids.map((id) => tx.findRecordById("students", id))
      for (const student of students) if (student.getString("daycare") !== schoolId) throw new Error("Every selected student must belong to this school.")
      for (const student of students) {
        const substitutions = tx.findRecordsByFilter("substitutions", "student = {:student}", "", 0, 0, { student: student.id })
        for (const substitution of substitutions) require(__hooks+'/audit-lib.js').remove(tx,substitution,e.auth)
        require(__hooks+'/audit-lib.js').remove(tx,student,e.auth)
      }
    })
    return e.json(200, { deleted: ids.length })
  } catch (_) { return e.json(400, { message: "No students were deleted. Check that all selected students belong to this school and roster access is enabled." }) }
})

routerAdd("POST", "/api/clone-menu", (e) => {
  if (!e.auth || !e.auth.getBool("active") || e.auth.getString("role") !== "clc_admin") return e.json(403, { message: "CLC admin access is required." })
  const body = e.requestInfo().body || {}
  const sourceId = String(body.source || ""), targetId = String(body.target || ""), month = String(body.month || "")
  if (!sourceId || !targetId || sourceId === targetId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return e.json(400, { message: "Choose different schools and a valid month." })
  let copied = 0
  try {
    $app.runInTransaction((tx) => {
      tx.findRecordById("daycares", sourceId)
      const target = tx.findRecordById("daycares", targetId)
      const start = month + "-01 00:00:00.000Z"
      const endDate = new Date(month + "-01T00:00:00Z")
      endDate.setUTCMonth(endDate.getUTCMonth() + 1)
      const end = endDate.toISOString().slice(0, 10) + " 00:00:00.000Z"
      const rows = tx.findRecordsByFilter("menu_days", "daycare = {:school} && service_date >= {:start} && service_date < {:end}", "service_date", 100, 0, { school: sourceId, start, end })
      if (!rows.length) throw new Error("No saved selections")
      const existing = tx.findRecordsByFilter("menu_days", "daycare = {:school} && service_date >= {:start} && service_date < {:end}", "", 100, 0, { school: targetId, start, end })
      for (const row of rows) {
        const date = row.getString("service_date")
        const matches = existing.filter((item) => item.getString("service_date").slice(0, 10) === date.slice(0, 10))
        const record = matches[0] || new Record(tx.findCollectionByNameOrId("menu_days"))
        for (const duplicate of matches.slice(1)) require(__hooks+'/audit-lib.js').remove(tx,duplicate,e.auth)
        const noService = target.getString("public_slug") === "tle-englewood-cliffs" && new Date(date.slice(0, 10) + "T12:00:00Z").getUTCDay() === 5 && !Number(JSON.parse(target.getString("baseline_counts") || "{}").Friday || 0)
        record.set("daycare", targetId)
        record.set("daycare_name", target.getString("name"))
        record.set("public_slug", target.getString("public_slug"))
        record.set("service_date", date)
        const tlePizza = target.getString("public_slug") === "tle-englewood-cliffs" && new Date(date.slice(0, 10) + "T12:00:00Z").getUTCDay() === 5 && /pizza/i.test(row.getString("menu"))
        record.set("menu", noService ? "" : tlePizza ? "Grilled Chicken & Veggies\nSteamed Rice" : row.getString("menu"))
        record.set("menu_item", noService || tlePizza ? "" : row.getString("menu_item"))
        record.set("note", noService ? "No service" : row.getString("note"))
        record.set("closed", noService || row.getBool("closed"))
        record.set("published", false)
        require(__hooks+'/audit-lib.js').save(tx,record,e.auth)
        copied++
      }
    })
    return e.json(200, { copied })
  } catch (_) { return e.json(400, { message: "No menus were copied. Check the schools and saved source selections, then try again." }) }
})
