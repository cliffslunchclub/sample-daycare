migrate(app=>{
 const rooms=app.findCollectionByNameOrId('classrooms');rooms.fields.add(new SelectField({name:'meal_size',values:['small','large','standard'],maxSelect:1}));app.save(rooms)
 for(const room of app.findAllRecords('classrooms')){const school=app.findRecordById('daycares',room.getString('daycare'));const students=app.findRecordsByFilter('students','classroom = {:id}','',0,0,{id:room.id});const sizes=[...new Set(students.map(row=>row.getString('size')).filter(value=>['small','large'].includes(value)))];room.set('meal_size',school.getBool('sizes_enabled')?(sizes.length===1?sizes[0]:'small'):'standard');app.save(room)}
},app=>{const c=app.findCollectionByNameOrId('classrooms');c.fields.removeByName('meal_size');app.save(c)})
