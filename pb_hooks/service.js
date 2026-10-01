const {CODES,validDate,mealsOn,counts,projection,weekDates}=require('./domain.js');
const id=()=>$security.randomString(15),now=()=>new Date().toISOString(),clone=x=>JSON.parse(JSON.stringify(x));
function fail(message,status=400){throw new ApiError(status,message);}
function assert(ok,message,status=400){if(!ok)fail(message,status);}
function text(v,max=500){assert(typeof v==='string'&&v.trim().length>0&&v.length<=max,'A required field is missing or too long.');return v.trim();}
function date(v){assert(validDate(v),'Choose a valid date.');return v;}
function month(v){assert(typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v),'Choose a valid month.');return v;}
const safeUser=r=>({id:r.id,name:r.getString('name'),email:r.getString('email'),role:r.getString('role'),locationId:r.getString('locationId')});
function context(app,state){
  const isClc=u=>u.role==='super'||u.role==='staff';
  const requireClc=u=>assert(isClc(u),'CLC access required.',403);
  const requireSuper=u=>assert(u.role==='super','Super administrator access required.',403);
  const location=(u,lid)=>{const l=state.locations.find(l=>l.id===lid);assert(l&&(isClc(u)||u.locationId===lid),'Location not available.',403);return l;};
  function audit(u,action,lid,details){state.audit.push({id:id(),at:now(),actor:u.name,action,locationId:lid,details});}
  function scoped(u){
    const clc=isClc(u),locations=state.locations.filter(l=>clc||l.id===u.locationId);
    const allowed=new Set(locations.map(l=>l.id));
    return {...state,locations,students:state.students.filter(s=>allowed.has(s.locationId)).map(s=>clc?s:{...s,versions:s.versions.map(v=>{const safe={...v};delete safe.allergy;delete safe.instructions;return safe;})}),closures:state.closures.filter(c=>allowed.has(c.locationId)),adjustments:state.adjustments.filter(a=>allowed.has(a.locationId)),notes:state.notes.filter(n=>allowed.has(n.locationId)),invoices:state.invoices.filter(i=>allowed.has(i.locationId)),audit:clc?state.audit.slice(-500).reverse():[],users:u.role==='super'?app.findAllRecords("users").map(safeUser):[],user:u};
  }
  function studentPayload(u,b,existing){
    const l=location(u,b.locationId);assert(!existing||existing.locationId===l.id,'Students cannot be moved between locations.');
    if(!isClc(u)&&existing)assert(existing.versions.every(v=>v.billing!=='clc'),'CLC manages this student.',403);
    const effective=date(b.effective), name=text(b.name,120), classroom=text(b.classroom,100);
    assert(l.classrooms.includes(classroom),'Choose a classroom configured for this location.');
    assert(Array.isArray(b.days)&&b.days.length===5,'Choose a Monday–Friday schedule.');
    for(const c of b.days)assert(c===null||c==='standard'||(l.substitutions&&CODES.includes(c)),'This meal option is not available.');
    assert(['school','clc','subsidized'].includes(b.billing),'Invalid billing arrangement.');
    if(!isClc(u))assert(b.billing===(existing?.versions.at(-1)?.billing||'school'),'Only CLC can change billing arrangements.',403);
    assert(['Small','Large'].includes(b.size),'Choose a portion size.');
    const prev=existing?.versions.at(-1);
    return {name,locationId:l.id,version:{effective,classroom,size:b.size,billing:b.billing,days:b.days,active:b.active!==false,allergy:isClc(u)?String(b.allergy||'').slice(0,1000):prev?.allergy||'',instructions:isClc(u)?String(b.instructions||'').slice(0,1000):prev?.instructions||''}};
  }
return {scoped,dispatch(p,b,u){
        if(p==='student'){
          const existing=b.id&&state.students.find(s=>s.id===b.id);assert(!b.id||existing,'Student not found.',404);
          const v=studentPayload(u,b,existing);
          if(existing){const old=clone(existing);existing.name=v.name;existing.versions=existing.versions.filter(x=>x.effective!==v.version.effective).concat(v.version).sort((a,b)=>a.effective.localeCompare(b.effective));audit(u,'Student updated',v.locationId,{before:old,after:existing});}
          else{const s={id:id(),name:v.name,locationId:v.locationId,versions:[v.version],exceptions:[]};state.students.push(s);audit(u,'Student added',v.locationId,{after:s});}
        }else if(p==='exception'){
          const s=state.students.find(s=>s.id===b.studentId);assert(s,'Student not found.',404);const l=location(u,s.locationId);
          if(!isClc(u))assert(s.versions.every(v=>v.billing!=='clc'),'CLC manages this student.',403);
          const d=date(b.date);assert(b.code===null||b.code==='standard'||(l.substitutions&&CODES.includes(b.code)),'Invalid meal option.');
          const old=s.exceptions.find(e=>e.date===d);s.exceptions=s.exceptions.filter(e=>e.date!==d);if(!b.remove)s.exceptions.push({date:d,code:b.code});audit(u,'Dated meal changed',l.id,{studentId:s.id,date:d,before:old,after:b.remove?null:b.code});
        }else if(p==='location'){
          requireSuper(u);let l=b.id?location(u,b.id):null;
          assert(Number.isSafeInteger(b.rateCents)&&b.rateCents>=0&&b.rateCents<=100000,'Enter a valid meal price.');
          assert(Array.isArray(b.classrooms)&&b.classrooms.length>0&&b.classrooms.length<=100,'Add at least one classroom.');
          assert(Array.isArray(b.menu)&&b.menu.length===5,'Enter a five-day menu.');
          assert(Number.isInteger(b.pizzaDay)&&b.pizzaDay>=-1&&b.pizzaDay<=4,'Invalid pizza day.');
          const old=l&&clone(l);const changes={name:text(b.name,100),rateCents:b.rateCents,sizes:!!b.sizes,substitutions:!!b.substitutions,classrooms:[...new Set(b.classrooms.map(c=>text(c,100)))],menu:b.menu.map(m=>text(m,150)),pizzaDay:b.pizzaDay};
          if(l&&!changes.substitutions&&l.substitutions)assert(!state.students.some(s=>s.locationId===l.id&&s.versions.at(-1)?.active&&s.versions.at(-1).days.some(c=>CODES.includes(c))),'Change active substitution schedules to standard meals before disabling substitutions.');
          if(l)Object.assign(l,changes);else{l={id:id(),...changes};state.locations.push(l);}audit(u,'Location settings updated',l.id,{before:old,after:l});
        }else if(p==='codes'){
          requireSuper(u);const old=clone(state.codes);for(const code of CODES)state.codes[code]=text(b[code],150);audit(u,'Substitution definitions updated',null,{before:old,after:state.codes});
        }else if(p==='closure'){
          requireClc(u);const l=location(u,b.locationId),d=date(b.date);const old=state.closures.find(c=>c.locationId===l.id&&c.date===d);state.closures=state.closures.filter(c=>!(c.locationId===l.id&&c.date===d));if(!b.remove)state.closures.push({locationId:l.id,date:d,note:text(b.note)});audit(u,b.remove?'Service day reopened':'Service day closed',l.id,{date:d,before:old,note:b.note});
        }else if(p==='adjustment'){
          requireClc(u);const l=location(u,b.locationId),m=month(b.month);const old=b.id&&state.adjustments.find(a=>a.id===b.id&&a.locationId===l.id&&a.month===m);assert(!b.id||old,'Adjustment not found.',404);
          assert(!state.invoices.some(i=>i.locationId===l.id&&i.month===m),'Reopen the invoice before changing its adjustments.');
          assert(Number.isSafeInteger(b.units)&&b.units!==0&&Math.abs(b.units)<=100000,'Enter a nonzero whole number of meals.');
          const prior=old&&clone(old),a={id:old?.id||id(),locationId:l.id,month:m,units:b.units,note:text(b.note,1000),by:u.name,at:now(),deleted:!!b.deleted};
          if(old)Object.assign(old,a);else state.adjustments.push(a);
          const q=projection(state.students,l,m,state.closures,state.adjustments);assert(q.billable>=0,'Adjustments cannot produce a negative meal count.');audit(u,b.deleted?'Adjustment removed':old?'Adjustment edited':'Adjustment added',l.id,{before:prior,after:a});
        }else if(p==='note'){
          const l=location(u,b.locationId),m=month(b.month);state.notes.push({id:id(),locationId:l.id,month:m,note:text(b.note,2000),by:u.name,at:now(),status:'Pending',reply:'',adjustmentId:null});audit(u,'Billing note submitted',l.id,{month:m});
        }else if(p==='review-note'){
          requireClc(u);const n=state.notes.find(n=>n.id===b.id);assert(n,'Note not found.',404);
          const old=clone(n);n.reply=text(b.reply,2000);n.status='Reviewed';n.reviewedBy=u.name;n.reviewedAt=now();
          n.adjustmentId=null;if(b.adjustmentId){assert(state.adjustments.some(a=>a.id===b.adjustmentId&&a.locationId===n.locationId&&a.month===n.month&&!a.deleted),'Choose an adjustment for the same location and month.');n.adjustmentId=b.adjustmentId;}audit(u,'Billing note reviewed',n.locationId,{before:old,after:n});
        }else if(p==='invoice'){
          requireClc(u);const l=location(u,b.locationId),m=month(b.month),old=state.invoices.find(i=>i.locationId===l.id&&i.month===m);
          if(b.reopen){assert(old,'No saved invoice to reopen.');state.invoices=state.invoices.filter(i=>i!==old);audit(u,'Invoice reopened',l.id,{before:old,reason:text(b.note)});}
          else{assert(!old,'Invoice already saved.');const inv={...projection(state.students,l,m,state.closures,state.adjustments),id:id(),at:now(),by:u.name};state.invoices.push(inv);audit(u,'Invoice subtotal saved',l.id,{after:inv});}
        }else if(p==='user'){
          requireSuper(u);assert(['super','staff','location'].includes(b.role),'Invalid role.');const lid=b.role==='location'?location(u,b.locationId).id:null;const email=text(b.email,200).toLowerCase();assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter a valid email.');assert(typeof b.password==='string'&&b.password.length>=12&&b.password.length<=200,'Use a password of 12–200 characters.');
          const account=new Record(app.findCollectionByNameOrId("users")); account.set("name",text(b.name,100));account.set("email",email);account.set("password",b.password);account.set("passwordConfirm",b.password);account.set("role",b.role);account.set("locationId",lid||"");app.save(account);audit(u,'Administrator created',lid,{email,role:b.role});
        }else if(p==='password'){
          const account=app.findRecordById('users',u.id);
          assert(typeof b.current==='string'&&account.validatePassword(b.current),'Current password is incorrect.');
          assert(typeof b.password==='string'&&b.password.length>=12&&b.password.length<=200,'Use a password of 12–200 characters.');
          account.setPassword(b.password);app.save(account);audit(u,'Password changed',u.locationId,{});
        }else fail('Endpoint not found.',404);
return {};}};
}
module.exports={context,safeUser};
