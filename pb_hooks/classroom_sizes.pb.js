onRecordValidate(e=>{
  const room=e.app.findRecordById('classrooms',e.record.getString('classroom'))
  // Earlier bootstrap migrations predate classroom-size settings.
  if(!room.collection().fields.getByName('meal_size'))return e.next()
  if(room.getString('daycare')!==e.record.getString('daycare'))throw new Error('Student and Classroom must belong to the same school.')
  const school=e.app.findRecordById('daycares',e.record.getString('daycare'))
  const size=school.getBool('sizes_enabled')?room.getString('meal_size'):'standard'
  if(!['small','large','standard'].includes(size))throw new Error('Choose a Classroom with a configured Meal Size.')
  e.record.set('size',size)
  e.next()
},'students')

onRecordUpdate(e=>{
  const before=e.record.original().getString('meal_size')
  if(before===e.record.getString('meal_size'))return e.next()
  e.app.runInTransaction(tx=>{
    e.app=tx;e.next()
    const lib=require(__hooks+'/billing-lib.js')
    for(const student of tx.findRecordsByFilter('students','classroom = {:room}','',0,0,{room:e.record.id})){
      student.set('size',e.record.getString('meal_size'));student.set('billing_effective_date',lib.nyDate());tx.save(student)
    }
  })
},'classrooms')
