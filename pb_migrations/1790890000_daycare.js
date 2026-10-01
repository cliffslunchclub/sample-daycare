migrate(app=>{
 app.delete(app.findCollectionByNameOrId('users'));
 const users=new Collection({type:'auth',name:'users',listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null,
 fields:[{type:'text',name:'name',required:true,max:100},{type:'select',name:'role',required:true,maxSelect:1,values:['super','staff','location']},{type:'text',name:'locationId',max:100}],
 passwordAuth:{enabled:true,identityFields:['email']},authToken:{duration:43200}});
 app.save(users);
 const workspace=new Collection({type:'base',name:'workspace',listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null,
 fields:[{type:'text',name:'key',required:true},{type:'json',name:'data',maxSize:50000000}]});app.save(workspace);
 const demo=$os.getenv('CLC_DEMO')==='1';
 const email=$os.getenv('CLC_ADMIN_EMAIL'), password=$os.getenv('CLC_ADMIN_PASSWORD');
 if(!email||password.length<12)throw new Error('Set CLC_ADMIN_EMAIL and CLC_ADMIN_PASSWORD (12+ characters) before initializing.');
 function seed(demo) { const id=()=>$security.randomString(15);
    const state={locations:[],students:[],closures:[],adjustments:[],notes:[],invoices:[],audit:[],codes:{A:'Option A',B:'Option B',C:'Option C',V:'Vegetarian'},demo};
    if(demo){
      state.locations=[{id:'garden',name:'Garden Demo',rateCents:400,sizes:true,substitutions:true,classrooms:['Sprouts','Sunflowers'],menu:['Pasta & vegetables','Chicken & rice','Sliders','Teriyaki bowl','Pizza'],pizzaDay:4},{id:'river',name:'Riverside Demo',rateCents:450,sizes:false,substitutions:false,classrooms:['Explorers','Discovery'],menu:['Pasta & vegetables','Chicken & rice','Sliders','Teriyaki bowl','Pizza'],pizzaDay:4}];
      state.codes={A:'Chicken nuggets & vegetables',B:'Chicken, rice & vegetables',C:'Butter pasta & garlic bread',V:'Vegetarian meal'};
      const names=['Alex Morgan','Jamie Brooks','Sam Parker','Taylor Reed','Casey Lane','Jordan Ellis','Riley Quinn','Avery Blake'];
      for(const [li,l] of state.locations.entries()) for(let i=0;i<8;i++)state.students.push({id:id(),name:names[i]+(li?' R.':''),locationId:l.id,versions:[{effective:'2026-01-01',active:true,classroom:l.classrooms[i%2],size:i%2?'Large':'Small',billing:i===7?'clc':i===6?'subsidized':'school',days:[0,1,2,3,4].map(d=>i===5&&d===1?null:l.substitutions&&i===2?'V':'standard'),allergy:i===7?'Demo dietary instruction — confirm before preparing':'',instructions:i===7?'Package and label separately':''}],exceptions:[]});
    }

return state; }

 const state=seed(demo);
 const record=new Record(workspace);record.set('key','main');record.set('data',state);app.save(record);
 function add(email,name,role,location){const u=new Record(users);u.set('email',email);u.set('name',name);u.set('role',role);u.set('locationId',location);u.setPassword(password);u.set('verified',true);app.save(u);}
 add(email,'CLC Administrator','super','');
 if(demo){add('staff@example.test','CLC Staff','staff','');for(const l of state.locations)add(l.id+'@example.test',l.name+' Admin','location',l.id);}
 const settings=app.settings();settings.meta.appName='Cliffs Lunch Club · Daycare';settings.rateLimits.enabled=true;settings.rateLimits.rules=[{label:'*:auth',audience:'',duration:60,maxRequests:20},{label:'/api/',audience:'',duration:60,maxRequests:500}];app.save(settings);
},app=>{app.delete(app.findCollectionByNameOrId('workspace'));app.delete(app.findCollectionByNameOrId('users'));});
