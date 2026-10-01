import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CODES,validDate,mealsOn,counts,projection,weekDates} from './domain.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const id=()=>randomBytes(12).toString('hex');
const now=()=>new Date().toISOString();
const digest=s=>createHash('sha256').update(s).digest('hex');
function hash(password,salt=randomBytes(16).toString('hex')) {return salt+':'+scryptSync(password,salt,64).toString('hex');}
function verify(password,value){const [salt,key]=value.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64));}
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function assert(ok,message,status=400){if(!ok)fail(message,status);}
function text(v,max=500){assert(typeof v==='string'&&v.trim().length>0&&v.length<=max,'A required field is missing or too long.');return v.trim();}
function date(v){assert(validDate(v),'Choose a valid date.');return v;}
function month(v){assert(typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v),'Choose a valid month.');return v;}
const safeUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,locationId:u.locationId});

export function createApp({dataDir=process.env.DATA_DIR||path.join(ROOT,'data'),demo=false,bootstrapEmail=process.env.CLC_ADMIN_EMAIL,bootstrapPassword=process.env.CLC_ADMIN_PASSWORD}={}) {
  mkdirSync(dataDir,{recursive:true});
  const db=new DatabaseSync(path.join(dataDir,'daycare.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS store (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT,role TEXT,locationId TEXT); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,userId TEXT,expires INTEGER);');
  let state=db.prepare('SELECT value FROM store WHERE id=1').get();
  if(!state){
    state={locations:[],students:[],closures:[],adjustments:[],notes:[],invoices:[],audit:[],codes:{A:'Option A',B:'Option B',C:'Option C',V:'Vegetarian'},demo};
    if(demo){
      state.locations=[{id:'garden',name:'Garden Demo',rateCents:400,sizes:true,substitutions:true,classrooms:['Sprouts','Sunflowers'],menu:['Pasta & vegetables','Chicken & rice','Sliders','Teriyaki bowl','Pizza'],pizzaDay:4},{id:'river',name:'Riverside Demo',rateCents:450,sizes:false,substitutions:false,classrooms:['Explorers','Discovery'],menu:['Pasta & vegetables','Chicken & rice','Sliders','Teriyaki bowl','Pizza'],pizzaDay:4}];
      state.codes={A:'Chicken nuggets & vegetables',B:'Chicken, rice & vegetables',C:'Butter pasta & garlic bread',V:'Vegetarian meal'};
      const names=['Alex Morgan','Jamie Brooks','Sam Parker','Taylor Reed','Casey Lane','Jordan Ellis','Riley Quinn','Avery Blake'];
      for(const [li,l] of state.locations.entries()) for(let i=0;i<8;i++)state.students.push({id:id(),name:names[i]+(li?' R.':''),locationId:l.id,versions:[{effective:'2026-01-01',active:true,classroom:l.classrooms[i%2],size:i%2?'Large':'Small',billing:i===7?'clc':i===6?'subsidized':'school',days:[0,1,2,3,4].map(d=>i===5&&d===1?null:l.substitutions&&i===2?'V':'standard'),allergy:i===7?'Demo dietary instruction — confirm before preparing':'',instructions:i===7?'Package and label separately':''}],exceptions:[]});
    }
    db.prepare('INSERT INTO store VALUES(1,?)').run(JSON.stringify(state));
  }else state=JSON.parse(state.value);
  if(!db.prepare('SELECT id FROM users LIMIT 1').get()){
    assert(bootstrapPassword&&bootstrapPassword.length>=12,'Set CLC_ADMIN_PASSWORD to at least 12 characters before first start.');
    assert(bootstrapEmail&&bootstrapEmail.includes('@'),'Set CLC_ADMIN_EMAIL before first start.');
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id(),'CLC Administrator',bootstrapEmail.toLowerCase(),hash(bootstrapPassword),'super',null);
    if(demo)for(const l of state.locations)db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id(),l.name+' Admin',l.id+'@example.test',hash(bootstrapPassword),'location',l.id);
  }
  const save=()=>db.prepare('UPDATE store SET value=? WHERE id=1').run(JSON.stringify(state));
  const isClc=u=>u.role==='super'||u.role==='staff';
  const requireClc=u=>assert(isClc(u),'CLC access required.',403);
  const requireSuper=u=>assert(u.role==='super','Super administrator access required.',403);
  const location=(u,lid)=>{const l=state.locations.find(l=>l.id===lid);assert(l&&(isClc(u)||u.locationId===lid),'Location not available.',403);return l;};
  function audit(u,action,lid,details){state.audit.push({id:id(),at:now(),actor:u.name,action,locationId:lid,details});}
  function scoped(u){
    const clc=isClc(u),locations=state.locations.filter(l=>clc||l.id===u.locationId);
    const allowed=new Set(locations.map(l=>l.id));
    return {...state,locations,students:state.students.filter(s=>allowed.has(s.locationId)).map(s=>clc?s:{...s,versions:s.versions.map(v=>({...v,allergy:undefined,instructions:undefined}))}),closures:state.closures.filter(c=>allowed.has(c.locationId)),adjustments:state.adjustments.filter(a=>allowed.has(a.locationId)),notes:state.notes.filter(n=>allowed.has(n.locationId)),invoices:state.invoices.filter(i=>allowed.has(i.locationId)),audit:clc?state.audit.slice(-500).reverse():[],users:u.role==='super'?db.prepare('SELECT id,name,email,role,locationId FROM users').all():[],user:safeUser(u)};
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
  async function body(req){let s='';for await(const b of req){s+=b;assert(s.length<=65536,'Request too large.',413);}try{return JSON.parse(s||'{}');}catch{fail('Invalid request.');}}
  const attempts=new Map();
  const server=http.createServer(async(req,res)=>{
    const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try{
      const url=new URL(req.url,'http://localhost'),p=url.pathname;
      if(!p.startsWith('/api/')){
        assert(req.method==='GET','Method not allowed.',405);
        const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/domain.mjs':'../domain.mjs'};
        assert(files[p],'Page not found.',404);
        res.writeHead(200,{'Content-Type':p.endsWith('.css')?'text/css':p.endsWith('.js')||p.endsWith('.mjs')?'text/javascript':'text/html','Cache-Control':'no-cache'});
        res.end(readFileSync(path.join(ROOT,'public',files[p])));return;
      }
      if(req.method!=='GET'){
        assert(req.headers['content-type']?.startsWith('application/json'),'JSON content type required.',415);
        if(req.headers.origin)assert(req.headers.origin===(process.env.PUBLIC_ORIGIN||`http://${req.headers.host}`),'Cross-origin request denied.',403);
      }
      if(p==='/api/login'&&req.method==='POST'){
        const b=await body(req),key=req.socket.remoteAddress;let a=attempts.get(key)||{count:0,at:Date.now()};if(Date.now()-a.at>900000)a={count:0,at:Date.now()};
        assert(a.count<20,'Too many login attempts. Try again in 15 minutes.',429);a.count++;attempts.set(key,a);
        const u=db.prepare('SELECT * FROM users WHERE email=?').get(String(b.email||'').toLowerCase());
        assert(u&&typeof b.password==='string'&&b.password.length<=1000&&verify(b.password,u.password),'Email or password is incorrect.',401);
        attempts.delete(key);db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
        const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),u.id,Date.now()+43200000);
        res.setHeader('Set-Cookie',`clc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);
        send(200,{user:safeUser(u)});return;
      }
      const token=(req.headers.cookie||'').split('; ').find(c=>c.startsWith('clc_session='))?.slice(12)||'';
      const session=db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(digest(token),Date.now());
      const u=session&&db.prepare('SELECT * FROM users WHERE id=?').get(session.userId);assert(u,'Please sign in.',401);
      if(p==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));res.setHeader('Set-Cookie','clc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');send(200,{});return;}
      if(p==='/api/state'&&req.method==='GET'){send(200,scoped(u));return;}
      if(p==='/api/production'&&req.method==='GET'){
        requireClc(u);const dates=weekDates(date(url.searchParams.get('date')));
        send(200,{dates,locations:state.locations.map(l=>({...l,days:dates.map(d=>({date:d,meals:mealsOn(state.students,l,d,state.closures),...counts(mealsOn(state.students,l,d,state.closures))}))})),codes:state.codes});return;
      }
      if(p==='/api/projection'&&req.method==='GET'){
        const l=location(u,url.searchParams.get('locationId'));send(200,projection(state.students,l,month(url.searchParams.get('month')),state.closures,state.adjustments));return;
      }
      assert(req.method==='POST','Endpoint not found.',404);const b=await body(req);
      const before=JSON.stringify(state);db.exec('BEGIN');
      try{
        let result={};
        if(p==='/api/student'){
          const existing=b.id&&state.students.find(s=>s.id===b.id);assert(!b.id||existing,'Student not found.',404);
          const v=studentPayload(u,b,existing);
          if(existing){const old=structuredClone(existing);existing.name=v.name;existing.versions=existing.versions.filter(x=>x.effective!==v.version.effective).concat(v.version).sort((a,b)=>a.effective.localeCompare(b.effective));audit(u,'Student updated',v.locationId,{before:old,after:existing});}
          else{const s={id:id(),name:v.name,locationId:v.locationId,versions:[v.version],exceptions:[]};state.students.push(s);audit(u,'Student added',v.locationId,{after:s});}
        }else if(p==='/api/exception'){
          const s=state.students.find(s=>s.id===b.studentId);assert(s,'Student not found.',404);const l=location(u,s.locationId);
          if(!isClc(u))assert(s.versions.every(v=>v.billing!=='clc'),'CLC manages this student.',403);
          const d=date(b.date);assert(b.code===null||b.code==='standard'||(l.substitutions&&CODES.includes(b.code)),'Invalid meal option.');
          const old=s.exceptions.find(e=>e.date===d);s.exceptions=s.exceptions.filter(e=>e.date!==d);if(!b.remove)s.exceptions.push({date:d,code:b.code});audit(u,'Dated meal changed',l.id,{studentId:s.id,date:d,before:old,after:b.remove?null:b.code});
        }else if(p==='/api/location'){
          requireSuper(u);let l=b.id?location(u,b.id):null;
          assert(Number.isSafeInteger(b.rateCents)&&b.rateCents>=0&&b.rateCents<=100000,'Enter a valid meal price.');
          assert(Array.isArray(b.classrooms)&&b.classrooms.length>0&&b.classrooms.length<=100,'Add at least one classroom.');
          assert(Array.isArray(b.menu)&&b.menu.length===5,'Enter a five-day menu.');
          assert(Number.isInteger(b.pizzaDay)&&b.pizzaDay>=-1&&b.pizzaDay<=4,'Invalid pizza day.');
          const old=l&&structuredClone(l);const changes={name:text(b.name,100),rateCents:b.rateCents,sizes:!!b.sizes,substitutions:!!b.substitutions,classrooms:[...new Set(b.classrooms.map(c=>text(c,100)))],menu:b.menu.map(m=>text(m,150)),pizzaDay:b.pizzaDay};
          if(l&&!changes.substitutions&&l.substitutions)assert(!state.students.some(s=>s.locationId===l.id&&s.versions.at(-1)?.active&&s.versions.at(-1).days.some(c=>CODES.includes(c))),'Change active substitution schedules to standard meals before disabling substitutions.');
          if(l)Object.assign(l,changes);else{l={id:id(),...changes};state.locations.push(l);}audit(u,'Location settings updated',l.id,{before:old,after:l});
        }else if(p==='/api/codes'){
          requireSuper(u);const old=structuredClone(state.codes);for(const code of CODES)state.codes[code]=text(b[code],150);audit(u,'Substitution definitions updated',null,{before:old,after:state.codes});
        }else if(p==='/api/closure'){
          requireClc(u);const l=location(u,b.locationId),d=date(b.date);const old=state.closures.find(c=>c.locationId===l.id&&c.date===d);state.closures=state.closures.filter(c=>!(c.locationId===l.id&&c.date===d));if(!b.remove)state.closures.push({locationId:l.id,date:d,note:text(b.note)});audit(u,b.remove?'Service day reopened':'Service day closed',l.id,{date:d,before:old,note:b.note});
        }else if(p==='/api/adjustment'){
          requireClc(u);const l=location(u,b.locationId),m=month(b.month);const old=b.id&&state.adjustments.find(a=>a.id===b.id&&a.locationId===l.id&&a.month===m);assert(!b.id||old,'Adjustment not found.',404);
          assert(!state.invoices.some(i=>i.locationId===l.id&&i.month===m),'Reopen the invoice before changing its adjustments.');
          assert(Number.isSafeInteger(b.units)&&b.units!==0&&Math.abs(b.units)<=100000,'Enter a nonzero whole number of meals.');
          const prior=old&&structuredClone(old),a={id:old?.id||id(),locationId:l.id,month:m,units:b.units,note:text(b.note,1000),by:u.name,at:now(),deleted:!!b.deleted};
          if(old)Object.assign(old,a);else state.adjustments.push(a);
          const q=projection(state.students,l,m,state.closures,state.adjustments);assert(q.billable>=0,'Adjustments cannot produce a negative meal count.');audit(u,b.deleted?'Adjustment removed':old?'Adjustment edited':'Adjustment added',l.id,{before:prior,after:a});
        }else if(p==='/api/note'){
          const l=location(u,b.locationId),m=month(b.month);state.notes.push({id:id(),locationId:l.id,month:m,note:text(b.note,2000),by:u.name,at:now(),status:'Pending',reply:'',adjustmentId:null});audit(u,'Billing note submitted',l.id,{month:m});
        }else if(p==='/api/review-note'){
          requireClc(u);const n=state.notes.find(n=>n.id===b.id);assert(n,'Note not found.',404);
          const old=structuredClone(n);n.reply=text(b.reply,2000);n.status='Reviewed';n.reviewedBy=u.name;n.reviewedAt=now();
          if(b.adjustmentId){assert(state.adjustments.some(a=>a.id===b.adjustmentId&&a.locationId===n.locationId&&a.month===n.month&&!a.deleted),'Choose an adjustment for the same location and month.');n.adjustmentId=b.adjustmentId;}audit(u,'Billing note reviewed',n.locationId,{before:old,after:n});
        }else if(p==='/api/invoice'){
          requireClc(u);const l=location(u,b.locationId),m=month(b.month),old=state.invoices.find(i=>i.locationId===l.id&&i.month===m);
          if(b.reopen){assert(old,'No saved invoice to reopen.');state.invoices=state.invoices.filter(i=>i!==old);audit(u,'Invoice reopened',l.id,{before:old,reason:text(b.note)});}
          else{assert(!old,'Invoice already saved.');const inv={...projection(state.students,l,m,state.closures,state.adjustments),id:id(),at:now(),by:u.name};state.invoices.push(inv);audit(u,'Invoice subtotal saved',l.id,{after:inv});}
        }else if(p==='/api/user'){
          requireSuper(u);assert(['super','staff','location'].includes(b.role),'Invalid role.');const lid=b.role==='location'?location(u,b.locationId).id:null;const email=text(b.email,200).toLowerCase();assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter a valid email.');assert(typeof b.password==='string'&&b.password.length>=12&&b.password.length<=200,'Use a password of 12–200 characters.');assert(!db.prepare('SELECT id FROM users WHERE email=?').get(email),'An account with that email already exists.');
          db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id(),text(b.name,100),email,hash(b.password),b.role,lid);audit(u,'Administrator created',lid,{email,role:b.role});
        }else if(p==='/api/password'){
          assert(typeof b.current==='string'&&verify(b.current,u.password),'Current password is incorrect.');assert(typeof b.password==='string'&&b.password.length>=12&&b.password.length<=200,'Use a password of 12–200 characters.');db.prepare('UPDATE users SET password=? WHERE id=?').run(hash(b.password),u.id);db.prepare('DELETE FROM sessions WHERE userId=? AND token<>?').run(u.id,digest(token));audit(u,'Password changed',u.locationId,{});
        }else fail('Endpoint not found.',404);
        save();db.exec('COMMIT');send(200,result);
      }catch(e){db.exec('ROLLBACK');state=JSON.parse(before);throw e;}
    }catch(e){send(e.status||500,{error:e.status?e.message:'The request could not be completed. Please try again.'});if(!e.status)console.error(e);}
  });
  return {server,db,close:()=>new Promise(resolve=>server.close(()=>{db.close();resolve();}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const demo=process.argv.includes('--demo');let password=process.env.CLC_ADMIN_PASSWORD;
  const dataDir=process.env.DATA_DIR||path.join(ROOT,'data',demo?'demo':'production');
  if(demo&&!existsSync(path.join(dataDir,'daycare.sqlite'))&&!password){password=randomBytes(12).toString('base64url');console.log(`Demo password: ${password}\nDemo accounts: clc@example.test, garden@example.test, river@example.test`);}
  try{const {server}=createApp({demo,dataDir,bootstrapEmail:process.env.CLC_ADMIN_EMAIL||(demo?'clc@example.test':undefined),bootstrapPassword:password});server.listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log(`Daycare app: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3000}`));}catch(e){console.error(e.message);process.exit(1);}
}
