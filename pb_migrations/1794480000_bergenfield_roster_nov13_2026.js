// Bergenfield roster from "hot lunch numbers.docx.pdf" (received 2026-11-12).
// Effective 2026-11-13; preserve all schedule dates and issued invoice records before then.
// "(2)" and "(3)" mark internal pizza-slice operations, not student names,
// meal sizes, or order quantities. Printed subtotals contain human errors;
// recurring service counts come solely from the individual listed names.
// Do not modify the historic October/November seed or issued invoices.
const effective='2026-11-13';
const previous='2026-11-12';
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const roster={"Mobile Infants":[["Amenze","Gia"],["Gia"],["Amenze","Gia"],["Amenze","Gia"],["Gia"]],"Purple Cats":[[],["Ethan"],["Ethan"],["Ethan"],["Ethan","Nolan","Lyla"]],"Khaki Kangaroo":[["Bianca","Benny","Vivi"],["Bianca","Benny","Vivi"],["Bianca","Benny","Vivi"],["Bianca","Benny","Vivi"],["Bianca","Benny","Vivi"]],"Yellow Ducks":[["Jayla","Leo (veg)","Damian"],["Jayla","Leo (veg)","Zayn"],["Jayla","Leo (veg)","Damian","Zayn"],["Jayla","Leo (veg)","Zayn"],["Jayla","Leo (veg)","Damian","Zayn","Gabby","Athena","Isabella","Mathias"]],"Blue Horses":[["Madison","Killian","Evan","Penny","Joey"],["Madison","Evan","Penny","Joey","Killian"],["Madison","Killian","Evan","Penny","Joey"],["Madison","Killian","Evan","Penny","Joey"],["Madison","Killian","Evan","Penny","Joey"]],"Green Frogs":[[],[],[],[],[]],"Goldfish":[["Ethan","Andres","Ade","Oliver","Margo"],["Ethan","Andres","Ade","Oliver","Margo"],["Ethan","Andres","Ade","Oliver","Margo"],["Ethan","Andres","Ade","Oliver","Margo"],["Ethan","Andres","Lucas","Amjad","Derek","Ade","Oliver","Margo","Starling"]],"Brown Bears":[["RJ","Siena","Charlotte","Kai","Rael"],["RJ","Siena","Charlotte","Kai","Rael"],["RJ","Siena","Charlotte","Kai","Rael"],["RJ","Siena","Charlotte","Kai","Rael"],["RJ","Siena","Charlotte","Kai","Rael","Emalina","Devaj"]]};

function stripPizzaMarkers(value){
  return String(value||'').replace(/\s*\([23]\)\s*/g,' ').replace(/\s+/g,' ').trim();
}
function nameKey(value){
  const first=String(value||'').trim().split(/\s+/)[0].toLowerCase().replace(/\([^)]*\)/g,'');
  return first==='viv'?'vivi':first;
}
function eachDayNames(list){
  const names=new Map();
  for(let day=0;day<5;day++)for(const label of list[day]){
    const key=nameKey(label);
    if(names.has(key) && names.get(key).label!==label && nameKey(names.get(key).label)!==key)
      throw new Error('Conflicting Bergenfield name: '+label);
    if(!names.has(key))names.set(key,{label,days:[]});
    names.get(key).days.push(weekdays[day]);
  }
  return names;
}
function findRoom(rooms,label){
  const alias=label==='Mobile Infants'?['Mobile Infants','Mobiles Infants']:[label];
  const matches=rooms.filter(room=>alias.some(name=>room.getString('name').trim().toLowerCase()===name.toLowerCase()));
  if(matches.length!==1)throw new Error('Expected exactly one Bergenfield classroom for '+label+', found '+matches.length+'.');
  return matches[0];
}
function existingCandidate(rows,roomId,key,used){
  const eligible=rows.filter(row=>!used.has(row.id)&&nameKey(row.getString('name'))===key&&(!row.getString('last_lunch_date')||row.getString('last_lunch_date')>=effective));
  const here=eligible.filter(row=>row.getString('classroom')===roomId);
  if(here.length>1)throw new Error('Ambiguous same-room Bergenfield student '+key);
  if(here.length===1)return here[0];
  // Move an existing child instead of creating a second record when there is
  // exactly one match in another room (e.g. Ade/Oliver/Margo).
  if(eligible.length===1)return eligible[0];
  if(eligible.length>1)throw new Error('Ambiguous cross-room Bergenfield student '+key);
  return null;
}
function changed(a,b){return JSON.stringify(a)!==JSON.stringify(b);}
// Explicitly upsert the effective-dated snapshot so a migration remains correct
// even if PocketBase runs it before record hooks have been registered.
function saveStudent(app,row,schoolId){
  app.save(row);
  const found=app.findRecordsByFilter('schedule_history',
    'daycare = {:school} && entity = {:entity} && effective_date = {:date}','',1,0,
    {school:schoolId,entity:row.id,date:effective});
  const version=found[0]||new Record(app.findCollectionByNameOrId('schedule_history'));
  const snapshot={
    name:row.getString('name'),classroom:row.getString('classroom'),
    active:row.getBool('active'),service_days:JSON.parse(row.getString('service_days')||'[]'),
    size:row.getString('size'),last_lunch_date:row.getString('last_lunch_date'),
  };
  version.set('daycare',schoolId);
  version.set('entity',row.id);
  version.set('effective_date',effective);
  version.set('snapshot',snapshot);
  app.save(version);
}
migrate(app=>{
  const found=app.findRecordsByFilter('daycares','public_slug = {:slug}','',1,0,{slug:'lightbridge-bergenfield'});
  if(!found.length)return; // A local database may not contain this school.
  const school=found[0];
  if(school.getString('count_mode')!=='roster')throw new Error('Bergenfield must use roster count mode.');
  const rooms=app.findRecordsByFilter('classrooms','daycare = {:id}','',0,0,{id:school.id});
  const all=app.findRecordsByFilter('students','daycare = {:id}','',0,0,{id:school.id});
  const collection=app.findCollectionByNameOrId('students');
  const used=new Set();
  for(const [roomName,list] of Object.entries(roster)){
    const room=findRoom(rooms,roomName);
    if(!room.getBool('active'))throw new Error('Inactive Bergenfield classroom: '+roomName);
    if(roomName==='Mobile Infants'&&room.getString('name')!==roomName){
      room.set('name',roomName);
      app.save(room);
    }
    const students=eachDayNames(list);
    for(const [key,{label,days}] of students){
      let row=existingCandidate(all,room.id,key,used);
      const fresh=!row;
      if(!row)row=new Record(collection);
      const oldDays=fresh?[]:JSON.parse(row.getString('service_days')||'[]');
      const oldName=fresh?'':row.getString('name');
      let name=stripPizzaMarkers(oldName||label);
      if(key==='vivi')name=name.replace(/^Viv\b/i,'Vivi');
      if(key==='leo'&&!/\(veg\)/i.test(name))name=name.replace(/\s+\([^)]*\)$/,'')+' (veg)';
      const shouldSave=fresh||oldName!==name||!row.getBool('active')||row.getString('classroom')!==room.id||
        changed(oldDays,days);
      if(shouldSave){
        row.set('name',name);
        row.set('daycare',school.id);
        row.set('classroom',room.id);
        row.set('active',true);
        row.set('service_days',days);
        row.set('billing_effective_date',effective);
        saveStudent(app,row,school.id); // Persist the Nov 13 schedule snapshot.
      }
      used.add(row.id);
      if(fresh)all.push(row);
    }
  }
  // Keep historical student identities and invoices. Students absent from the
  // supplied list stop receiving scheduled meals only after November 12.
  for(const row of all){
    if(used.has(row.id))continue;
    const oldDays=JSON.parse(row.getString('service_days')||'[]');
    const cleanName=stripPizzaMarkers(row.getString('name'));
    const stopSchedule=row.getBool('active')&&oldDays.length>0;
    if(cleanName===row.getString('name')&&!stopSchedule)continue;
    if(cleanName!==row.getString('name'))row.set('name',cleanName);
    if(stopSchedule){
      row.set('service_days',[]);
      row.set('billing_effective_date',effective);
      if(!row.getString('last_lunch_date')||row.getString('last_lunch_date')>previous)
        row.set('last_lunch_date',previous);
    }
    saveStudent(app,row,school.id);
  }
},_app=>{
  // Historical schedule and financial changes must not be rolled back by code deployment.
});
