migrate(app=>{
 const students=app.findCollectionByNameOrId('students');
 if(!students.fields.getByName('last_lunch_date'))students.fields.add(new TextField({name:'last_lunch_date',max:10}));
 students.deleteRule='@request.auth.active = true && @request.auth.role = "clc_admin"';
 app.save(students);
},app=>{
 // Retain departure dates and the archive policy rather than discard history.
});
