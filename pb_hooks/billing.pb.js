// All mutations are scoped and validated here; collections deny direct writes.
routerAdd('POST', '/api/billing', (e) => {
  if(!e.auth || !e.auth.getBool('active'))return e.json(403,{message:'Please sign in.'})
  const lib=require(__hooks+'/billing-lib.js'), body=e.requestInfo().body||{}, action=String(body.action||'')
  const clc=e.auth.getString('role')==='clc_admin', schoolId=String(body.daycare||'')
  if(!clc && (e.auth.getString('role')!=='daycare_admin'||schoolId!==e.auth.getString('daycare')))return e.json(403,{message:'School access is required.'})
  try {
    let result={}
    $app.runInTransaction(tx=>{
      const school=tx.findRecordById('daycares',schoolId)
      const plain=record=>{const value=record.publicExport();for(const key of Object.keys(value)){if(['snapshot','lines','daily_counts','baseline_counts','clc_managed_counts','service_days'].includes(key))value[key]=JSON.parse(record.getString(key)||'null');else if(['service_date','created','updated'].includes(key))value[key]=record.getString(key)}return JSON.parse(JSON.stringify(value))}
      const history=()=>tx.findRecordsByFilter('schedule_history','daycare = {:school}','effective_date',0,0,{school:schoolId}).map(plain)
      const menus=()=>tx.findRecordsByFilter('menu_days','daycare = {:school}','',0,0,{school:schoolId}).map(plain)
      const requests=()=>tx.findRecordsByFilter('lunch_requests','daycare = {:school}','',0,0,{school:schoolId})
      const checkInvoice=id=>{const r=tx.findRecordById('invoices',String(id||''));if(r.getString('daycare')!==schoolId)throw new Error('Invoice belongs to another school.');return r}
      const putTotals=(record,lines)=>{const sum=lib.totals(lines);for(const key of Object.keys(sum))record.set(key,sum[key])}
      const requestLine=r=>{const day=lib.daily(plain(school),history(),menus(),r.getString('service_date'));const included=!day.closed && !day.roster.some(k=>k.id===r.getString('student')||String(k.name||'').trim().toLowerCase()===r.getString('student_label').trim().toLowerCase());return {description:`One-off lunch: ${r.getString('student_label')} (${lib.displayDate(r.getString('service_date'))})`,quantity:included?1:0,rate:day.rate,taxable:true,request_id:r.id}}
      const allInvoices=()=>tx.findRecordsByFilter('invoices','daycare = {:school}','',0,0,{school:schoolId}).map(plain)
      const isTle=school.getString('public_slug')==='tle-englewood-cliffs'
      const nextPeriod=()=>{const periods=allInvoices().filter(i=>i.billing_cycle==='biweekly').sort((a,b)=>b.period_start.localeCompare(a.period_start));return periods.length?lib.addDays(periods[0].period_start,14):school.getString('billing_anchor')}
      const biweeklyLines=(start,end)=>{const h=history(),m=menus(),plan=lib.monthlyPlan(plain(school),h,m,start.slice(0,7),start,end);const carry=lib.carryForward(plain(school),h,m,allInvoices(),start);return {...plan,lines:[...plan.lines,...carry],notes:'Service period: '+lib.displayDate(start)+' to '+lib.displayDate(end)+'.\n'+plan.notes+(carry.length?'\n'+carry.map(l=>l.description+': '+(l.quantity>0?'+':'')+l.quantity+' x $'+l.rate.toFixed(2)+'.').join('\n'):'')}}
      if(action==='period-settings'){
        if(!isTle)throw new Error('Two-week periods are configured for TLE only.');
        const next=nextPeriod();result={anchor:school.getString('billing_anchor'),...(next?lib.biweeklyPeriod(next):{})}
      } else if(action==='generate-biweekly'){
        if(!clc||!isTle)throw new Error('CLC access and TLE school are required.');
        if(allInvoices().some(i=>i.billing_cycle==='biweekly'&&i.status==='draft'))throw new Error('Review and issue the existing two-week draft before creating the next one.');
        const expected=nextPeriod(),start=String(body.period_start||expected||''),period=lib.biweeklyPeriod(start);
        if(expected&&start!==expected)throw new Error('The next period starts '+lib.displayDate(expected)+'.');
        const overlap=allInvoices().some(i=>{const from=i.period_start||i.month+'-01',to=i.period_end||lib.addDays(i.month+'-01',new Date(Number(i.month.slice(0,4)),Number(i.month.slice(5)),0).getDate()-1);return from<=period.period_end&&to>=start});
        if(overlap)throw new Error('This period overlaps an existing invoice. Review or delete the draft first.');
        const plan=biweeklyLines(start,period.period_end),invoice=new Record(tx.findCollectionByNameOrId('invoices'));
        const invoiceDate=String(body.invoice_date||period.invoice_date);if(!lib.validDate(invoiceDate))throw new Error('Choose a valid invoice date.');
        const number='TLE'+start.replace(/-/g,'');if(tx.findRecordsByFilter('invoices','number = {:number}','',1,0,{number}).length)throw new Error('Invoice number already exists.');
        for(const [k,v]of Object.entries({daycare:schoolId,school_name:school.getString('name'),month:start.slice(0,7),billing_cycle:'biweekly',period_start:start,period_end:period.period_end,due_date:period.due_date,invoice_date:invoiceDate,number,status:'draft',daily_counts:plan.counts,notes:'Payment due by '+lib.displayDate(period.due_date)+'.',generated_notes:plan.notes}))invoice.set(k,v);
        const extras=requests().filter(r=>r.getString('kind')==='lunch'&&r.getString('status')==='approved'&&!r.getString('invoice_id')&&r.getString('service_date')<=period.period_end);
        const lines=[...plan.lines,...extras.map(requestLine)];if(!lines.length)lines.push({description:'Lunch Catering',quantity:0,rate:school.getFloat('invoice_rate'),taxable:true,baseline:true});
        putTotals(invoice,lines);tx.save(invoice);for(const r of extras){r.set('invoice_id',invoice.id);tx.save(r)}
        if(!school.getString('billing_anchor')){school.set('billing_anchor',start);tx.save(school)}result=plain(invoice);
      } else if(action==='request') {
        const kind=body.kind==='lunch'?'lunch':'note', studentId=String(body.student||'')
        const dates=kind==='lunch' ? lib.requestDates(body.service_dates,body.service_date) : ['']
        const created=[]
        let classroomLabel='',mealSize='standard'
        if(kind==='lunch'){if(!body.classroom&&!school.getBool('sizes_enabled'))classroomLabel='School Total';else{const room=tx.findRecordById('classrooms',String(body.classroom||''));if(room.getString('daycare')!==schoolId||!room.getBool('active'))throw new Error('Choose an active classroom in this school.');classroomLabel=room.getString('name');mealSize=school.getBool('sizes_enabled')?room.getString('meal_size'):'standard';if(!['small','large','standard'].includes(mealSize))throw new Error('Configure the classroom meal size first.')}}
        const h=history(),m=menus(),existingRequests=requests()
        if(!String(body.note||'').trim() || String(body.note).length>4000)throw new Error('Enter a note of up to 4000 characters.')
        let label=String(body.student_label||'').trim()
        if(studentId){const student=tx.findRecordById('students',studentId);if(student.getString('daycare')!==schoolId)throw new Error('Student belongs to another school.');label=student.getString('name')}
        for(const date of dates) {
        if(kind==='lunch') {
          if(!lib.validDate(date)||!label)throw new Error('Choose a student or trial name and valid date.')
          const counts=lib.daily(plain(school),h,m,date)
          if(counts.closed)throw new Error(date+': This is a no-service day. No dates were submitted.')
          if(counts.roster.some(r=>(studentId && r.id===studentId)||String(r.name||'').trim().toLowerCase()===label.toLowerCase()))throw new Error(date+': This student already receives a scheduled lunch. No dates were submitted.')
          if(existingRequests.some(r=>r.getString('kind')==='lunch'&&r.getString('service_date')===date&&['pending','approved'].includes(r.getString('status'))&&((studentId && r.getString('student')===studentId)||r.getString('student_label').trim().toLowerCase()===label.toLowerCase())))throw new Error(date+': A lunch request already exists for this student. No dates were submitted.')
        }
        const r=new Record(tx.findCollectionByNameOrId('lunch_requests'))
        for(const [key,value] of Object.entries({daycare:schoolId,kind,student:studentId,student_label:label,classroom_label:classroomLabel,service_date:date,size:mealSize,code:['A','B','C','V'].includes(body.code)?body.code:'',note:String(body.note),status:kind==='lunch'?'pending':'new',created_by:e.auth.getString('display_name')||e.auth.getString('email')}))r.set(key,value)
        tx.save(r);created.push(plain(r))
        }
        result=Array.isArray(body.service_dates)?{created:created.length,requests:created}:created[0]
      } else if(action==='delete-request') {
        if(!clc)throw new Error('Only CLC admins can delete one-off requests.');
        const r=tx.findRecordById('lunch_requests',String(body.id||''));if(r.getString('daycare')!==schoolId||r.getString('kind')!=='lunch')throw new Error('Choose a one-off request in this school.');
        let issued=false;
        if(r.getString('invoice_id')){const invoice=checkInvoice(r.getString('invoice_id'));issued=invoice.getString('status')==='issued';if(!issued){const lines=JSON.parse(invoice.getString('lines')||'[]').filter(line=>line.request_id!==r.id);if(!lines.length)lines.push({description:'Adjustment',quantity:0,rate:school.getFloat('invoice_rate'),taxable:true});putTotals(invoice,lines);const description=requestLine(r).description;invoice.set('generated_notes',invoice.getString('generated_notes').split('\n').filter(line=>!line.startsWith(description+':')).join('\n'));tx.save(invoice);r.set('invoice_id','');}}
        // Keep an audit record, particularly when an issued invoice references it.
        r.set('status','deleted');tx.save(r);result={message:issued?'One-off request deleted. Its issued invoice is unchanged; add a credit adjustment if needed.':'One-off request deleted. Kitchen counts and any draft invoice were updated.'};
      } else if(action==='request-status') {
        if(!clc)throw new Error('CLC approval is required.')
        const r=tx.findRecordById('lunch_requests',String(body.id||''))
        if(r.getString('daycare')!==schoolId)throw new Error('Wrong school.')
        const status=String(body.status||'')
        if(r.getString('kind')==='lunch') {
          if(r.getString('status')!=='pending'||!['approved','rejected'].includes(status))throw new Error('Only pending requests can be approved or rejected.')
          if(status==='approved'){
            const date=r.getString('service_date'), counts=lib.daily(plain(school),history(),menus(),date)
            if(counts.closed || counts.roster.some(s=>s.id===r.getString('student')||String(s.name||'').trim().toLowerCase()===r.getString('student_label').trim().toLowerCase()))throw new Error('No service or student already scheduled. Review this request.')
            const drafts=tx.findRecordsByFilter('invoices','daycare = {:school} && status = "draft"','',0,0,{school:schoolId}).filter(i=>i.getString('billing_cycle')==='biweekly'?i.getString('period_start')<=date&&i.getString('period_end')>=date:i.getString('month')===date.slice(0,7))
            if(drafts.length===1){const invoice=drafts[0];putTotals(invoice,[...(JSON.parse(invoice.getString('lines')||'[]')||[]),requestLine(r)]);invoice.set('generated_notes',invoice.getString('generated_notes')+'\n'+requestLine(r).description+': +1 meal.');tx.save(invoice);r.set('invoice_id',invoice.id)}
          }
        }else if(!['acknowledged','resolved'].includes(status))throw new Error('Choose Acknowledged or Resolved.')
        r.set('status',status);r.set('response',String(body.response||''));tx.save(r);result=plain(r)
      } else if(action==='counts') {
        const start=String(body.start||''), end=String(body.end||'')
        if(!lib.validDate(start)||!lib.validDate(end)||end<start||Date.parse(end)-Date.parse(start)>32*86400000)throw new Error('Choose up to 32 days.')
        const h=history(),m=menus(),rr=requests().filter(r=>r.getString('kind')==='lunch'&&r.getString('status')==='approved'), dates=[]
        for(let d=new Date(start+'T12:00:00Z');d.toISOString().slice(0,10)<=end;d.setUTCDate(d.getUTCDate()+1)){
          const counts=lib.daily(plain(school),h,m,d.toISOString().slice(0,10)), extras=rr.filter(r=>r.getString('service_date')===counts.date)
          dates.push({...counts,roster:undefined,extra:counts.closed?0:extras.length,kitchen_total:counts.quantity+counts.allergies+(counts.closed?0:extras.length),requests:extras.map(r=>({name:r.getString('student_label'),size:r.getString('size'),code:r.getString('code')}))})
        }result={dates}
      } else if(action==='generate') {
        if(!clc)throw new Error('CLC access is required.')
        if(isTle)throw new Error('Use Create Two-Week Draft for TLE.');
        const month=String(body.month||'')
        if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Choose a valid month.')
        if(body.invoice_date && !lib.validDate(String(body.invoice_date)))throw new Error('Choose a valid invoice date.')
        const existing=tx.findRecordsByFilter('invoices','daycare = {:school} && month = {:month} && status = "draft"','',1,0,{school:schoolId,month})
        if(existing.length)throw new Error('A draft already exists for this month. Edit it instead.')
        const h=history(),m=menus(),counts=[],groups={}
        const alreadyIssued=tx.findRecordsByFilter('invoices','daycare = {:school} && month = {:month} && status = "issued"','',1,0,{school:schoolId,month}).length>0
        const plan=lib.monthlyPlan(plain(school),h,m,month);counts.push(...plan.counts)
        const lines=alreadyIssued?[]:plan.lines
        const extras=requests().filter(r=>{if(r.getString('kind')!=='lunch'||r.getString('status')!=='approved'||r.getString('invoice_id')||r.getString('service_date')>counts[counts.length-1].date)return false;const day=lib.daily(plain(school),h,m,r.getString('service_date'));return !day.closed && !day.roster.some(k=>k.id===r.getString('student')||String(k.name||'').trim().toLowerCase()===r.getString('student_label').trim().toLowerCase())})
        for(const r of extras)lines.push(requestLine(r))
        if(!lines.length)lines.push({description:lib.monthLabel(month)+(alreadyIssued?' Additional Adjustment':' Lunch Catering'),quantity:0,rate:school.getFloat('invoice_rate'),taxable:true})
        const slug=school.getString('public_slug'),prefix=slug==='lightbridge-bergenfield'?'BF':slug==='lightbridge-fort-lee'?'FL':slug==='tle-englewood-cliffs'?'TLE':'INV'
        const base=prefix+month.slice(5)+month.slice(2,4), same=tx.findRecordsByFilter('invoices','number ~ {:prefix}','',0,0,{prefix:base})
        let number=base,n=2;while(same.some(row=>row.getString('number')===number))number=base+'.'+n++
        const invoice=new Record(tx.findCollectionByNameOrId('invoices'))
        for(const [k,v] of Object.entries({daycare:schoolId,school_name:school.getString('name'),month,invoice_date:String(body.invoice_date||lib.nyDate()),number,status:'draft',daily_counts:alreadyIssued?[]:counts,notes:'',generated_notes:alreadyIssued?'Adjustment invoice. Monthly scheduled lunches were already invoiced.':plan.notes}))invoice.set(k,v)
        putTotals(invoice,lines);invoice.set('generated_notes',String(invoice.getString('generated_notes')||'')+(extras.length?'\n'+extras.map(r=>{const line=requestLine(r);return line.description+': +'+line.quantity+' meals.'}).join('\n'):''));tx.save(invoice);for(const r of extras){r.set('invoice_id',invoice.id);tx.save(r)}result=plain(invoice)
      } else if(action==='recalculate') {
        if(!clc)throw new Error('CLC access is required.');const invoice=checkInvoice(body.id);if(invoice.getString('status')!=='draft')throw new Error('Only drafts can be recalculated.');
        if(invoice.getString('billing_cycle')==='biweekly'){
          const plan=biweeklyLines(invoice.getString('period_start'),invoice.getString('period_end'));
          const manual=JSON.parse(invoice.getString('lines')||'[]').filter(l=>!l.baseline&&!l.request_id&&!['schedule','carry'].includes(l.adjustment_type));
          const auto=requests().filter(r=>r.getString('invoice_id')===invoice.id).map(requestLine);
          const lines=[...plan.lines,...manual,...auto];if(!lines.length)lines.push({description:'Lunch Catering',quantity:0,rate:school.getFloat('invoice_rate'),taxable:true,baseline:true});
          putTotals(invoice,lines);invoice.set('daily_counts',plan.counts);invoice.set('generated_notes',plan.notes);tx.save(invoice);result=plain(invoice);return;
        }
        const month=invoice.getString('month'),plan=lib.monthlyPlan(plain(school),history(),menus(),month);
        const issued=tx.findRecordsByFilter('invoices','daycare = {:school} && month = {:month} && status = "issued"','',1,0,{school:schoolId,month}).length>0;
        const saved=JSON.parse(invoice.getString('lines')||'[]'),manual=saved.filter(line=>!line.request_id && line.adjustment_type!=='schedule' && !line.baseline && !line.description.startsWith(month+' Lunch Catering') && line.description!==month+' Additional Adjustment' && line.description!==lib.monthLabel(month)+' Additional Adjustment');
        const auto=requests().filter(r=>r.getString('invoice_id')===invoice.id).map(requestLine),lines=[...(issued?[]:plan.lines),...manual,...auto];
        if(!lines.length)lines.push({description:month+' Additional Adjustment',quantity:0,rate:school.getFloat('invoice_rate'),taxable:true});
        putTotals(invoice,lines);invoice.set('daily_counts',issued?[]:plan.counts);invoice.set('generated_notes',(issued?'Adjustment invoice. Monthly scheduled lunches were already invoiced.':plan.notes)+(auto.length?'\n'+auto.map(line=>line.description+': +'+line.quantity+' meals.').join('\n'):''));tx.save(invoice);result=plain(invoice);
      } else if(action==='save'||action==='issue'||action==='delete') {
        if(!clc)throw new Error('CLC access is required.')
        const invoice=checkInvoice(body.id)
        if(invoice.getString('status')!=='draft')throw new Error('Issued invoices are frozen. Put corrections on a new invoice.')
        if(action==='delete'){
          if(invoice.getString('billing_cycle')==='biweekly'&&allInvoices().some(i=>i.billing_cycle==='biweekly'&&i.period_start>invoice.getString('period_start')))throw new Error('Only the latest two-week draft can be deleted.');
          for(const r of requests().filter(r=>r.getString('invoice_id')===invoice.id)){r.set('invoice_id','');tx.save(r)}tx.delete(invoice);if(invoice.getString('billing_cycle')==='biweekly'&&!allInvoices().some(i=>i.billing_cycle==='biweekly')){school.set('billing_anchor','');tx.save(school)}result={deleted:true}
        }else{
          if(!String(body.number||'').trim()||!lib.validDate(String(body.invoice_date||'')))throw new Error('Invoice number and date are required.')
          const duplicate=tx.findRecordsByFilter('invoices','number = {:number} && id != {:id}','',1,0,{number:String(body.number).trim(),id:invoice.id});if(duplicate.length)throw new Error('Invoice number already exists.')
          // Auto-adjustments cannot be removed or converted to manual lines.
          const linked=requests().filter(r=>r.getString('invoice_id')===invoice.id)
          if(!Array.isArray(body.lines))throw new Error('Invoice lines are required.')
          const biweekly=invoice.getString('billing_cycle')==='biweekly';
          const manual=body.lines.filter(line=>!line.request_id&&(!biweekly||line.adjustment_type!=='carry'));
          for(const line of manual){delete line.carry_source;delete line.carry_date;delete line.carry_snapshot}
          if(biweekly)manual.push(...lib.carryForward(plain(school),history(),menus(),allInvoices(),invoice.getString('period_start')));
          const auto=linked.map(r=>requestLine(r));putTotals(invoice,[...manual,...auto]);
          const notes=invoice.getString('generated_notes').split('\n').filter(line=>!line.startsWith('Midmonth additions:')&&!line.startsWith('Midmonth removals:')&&!line.startsWith('One-off lunch:')&&!line.startsWith('Period additions:')&&!line.startsWith('Period removals:')&&!line.startsWith('Schedule correction for '));
          for(const line of [...manual,...auto].filter(l=>l.request_id||['schedule','carry'].includes(l.adjustment_type)))notes.push(line.description+': '+(line.quantity>0?'+':'')+line.quantity+' meals.');
          invoice.set('generated_notes',notes.filter(Boolean).join('\n'))
          invoice.set('number',String(body.number).trim());invoice.set('invoice_date',String(body.invoice_date));invoice.set('notes',String(body.notes||''));if(action==='issue')invoice.set('status','issued');tx.save(invoice);result=plain(invoice)
        }
      } else if(action==='flag') {
        const invoice=checkInvoice(body.id);if(invoice.getString('status')!=='issued')throw new Error('Only issued invoices can be flagged.')
        const message=String(body.message||'').trim();if(!message||message.length>4000)throw new Error('Enter a correction message.')
        const flag=new Record(tx.findCollectionByNameOrId('invoice_flags'));for(const[k,v]of Object.entries({daycare:schoolId,invoice:invoice.id,message,status:'open',created_by:e.auth.getString('display_name')||e.auth.getString('email')}))flag.set(k,v);tx.save(flag);result=plain(flag)
      } else if(action==='resolve-flag') {
        if(!clc)throw new Error('CLC access is required.');const r=tx.findRecordById('invoice_flags',String(body.id||''));if(r.getString('daycare')!==schoolId)throw new Error('Wrong school.');r.set('response',String(body.response||''));r.set('status','resolved');tx.save(r);result=plain(r)
      }else throw new Error('Unknown action.')
    })
    return e.json(200,result)
  } catch(err){return e.json(400,{message:String(err.message||err)})}
})

// Capture history in the same transaction as each schedule mutation.
onRecordCreate((e)=>{e.app.runInTransaction(tx=>{e.app=tx;e.next();require(__hooks+'/schedule-lib.js').capture(tx,e.record,false)})},'students','daycares')
onRecordUpdate((e)=>{
  const school=e.record.collection().name==='daycares'
  const keys=school?['count_mode','baseline_counts','clc_managed_counts','invoice_rate','billing_effective_date']:['active','service_days','size','classroom','billing_effective_date']
  const previous=e.record.original()
  if(keys.every(key=>e.record.getString(key)===previous.getString(key)))return e.next()
  e.app.runInTransaction(tx=>{e.app=tx;e.next();require(__hooks+'/schedule-lib.js').capture(tx,e.record,false)})
},'students','daycares')
onRecordDelete((e)=>{e.app.runInTransaction(tx=>{e.app=tx;require(__hooks+'/schedule-lib.js').capture(tx,e.record,true);e.next()})},'students')
