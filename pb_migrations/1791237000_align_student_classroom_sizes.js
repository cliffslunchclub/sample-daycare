migrate(app=>{
 for(const student of app.findAllRecords('students')){
  const room=app.findRecordById('classrooms',student.getString('classroom')),school=app.findRecordById('daycares',student.getString('daycare'))
  const size=school.getBool('sizes_enabled')?room.getString('meal_size'):'standard'
  if(size && student.getString('size')!==size){student.set('size',size);student.set('billing_effective_date',new Date().toISOString().slice(0,10));app.save(student)}
 }
},app=>{})
