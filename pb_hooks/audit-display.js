const relations={daycare:'daycares',classroom:'classrooms',student:'students',created_by:'users',admin:'users',user:'users',menu_item:'menu_items',invoice:'invoices',invoice_id:'invoices'};
function reference(app,table,id,school,schoolName){
  if(!id)return '';
  if(table==='daycares' && id===school)return schoolName;
  try {
    const row=app.findRecordById(table,id);
    if(table!=='daycares' && row.getString('daycare')!==school)return '';
    return row.getString('name')||row.getString('display_name')||row.getString('student_label')||row.getString('number')||row.getString('email');
  }catch(_){return '';}
}
function decorate(app,type,school,schoolName,before,after,diff){
  let settings;try{settings=app.findRecordById('daycares',school)}catch(_){}
  for(const [key,change] of Object.entries(diff)) {
    if(relations[key])for(const side of ['before','after']) {
      const label=reference(app,relations[key],String(change[side]||''),school,schoolName);
      if(label)change[side+'_label']=label;
    }
    if(key==='code' && settings)for(const side of ['before','after']) {
      const code=String(change[side]||''),description=settings.getString('sub_'+code.toLowerCase()+'_label');
      if(code){const names=JSON.parse(settings.getString('sub_option_names')||'{}')||{};change[side+'_label']=(names[code]||code)+(description?' — '+description:'');}
    }
  }
  const context=value=>({
    subject:value.name||value.display_name||value.student_label||reference(app,'students',String(value.student||''),school,schoolName)||'',
    classroom:reference(app,'classrooms',String(value.classroom||''),school,schoolName),
    weekday:value.weekday||'',service_date:value.service_date||'',kind:value.kind||'',number:value.number||''
  });
  diff.__display={version:1,before:context(before||{}),after:context(after||{})};
  return diff;
}
module.exports={decorate,reference};
