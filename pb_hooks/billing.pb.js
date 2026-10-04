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
      const requestLine=r=>{const day=lib.daily(plain(school),history(),menus(),r.getString('service_date'));const included=!day.closed && !day.roster.some(k=>k.id===r.getString('student')||String(k.name||'').trim().toLowerCase()===r.getString('student_label').trim().toLowerCase());return {description:`One-off lunch: ${r.getString('student_label')} (${r.getString('service_date')})`,quantity:included?1:0,rate:day.rate,taxable:true,request_id:r.id}}
      if(action==='request') {
        const kind=body.kind==='lunch'?'lunch':'note', date=String(body.service_date||''), studentId=String(body.student||'')
        if(!String(body.note||'').trim() || String(body.note).length>4000)throw new Error('Enter a note of up to 4000 characters.')
        let label=String(body.student_label||'').trim()
        if(studentId){const student=tx.findRecordById('students',studentId);if(student.getString('daycare')!==schoolId)throw new Error('Student belongs to another school.');label=student.getString('name')}
        if(kind==='lunch') {
          if(!lib.validDate(date)||!label)throw new Error('Choose a student or trial name and valid date.')
          const counts=lib.daily(plain(school),history(),menus(),date)
          if(counts.closed)throw new Error('This is a no-service day.')
          if(counts.roster.some(r=>(studentId && r.id===studentId)||String(r.name||'').trim().toLowerCase()===label.toLowerCase()))throw new Error('This student already receives a scheduled lunch on this date.')
          if(requests().some(r=>r.getString('kind')==='lunch'&&r.getString('service_date')===date&&r.getString('status')!=='rejected'&&((studentId && r.getString('student')===studentId)||r.getString('student_label').trim().toLowerCase()===label.toLowerCase())))throw new Error('A lunch request already exists for this student and date.')
        }
        const r=new Record(tx.findCollectionByNameOrId('lunch_requests'))
        for(const [key,value] of Object.entries({daycare:schoolId,kind,student:studentId,student_label:label,classroom_label:String(body.classroom_label||''),service_date:date,size:['small','large'].includes(body.size)?body.size:'standard',code:['A','B','C','V'].includes(body.code)?body.code:'',note:String(body.note),status:kind==='lunch'?'pending':'new',created_by:e.auth.getString('display_name')||e.auth.getString('email')}))r.set(key,value)
        tx.save(r);result=plain(r)
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
            const drafts=tx.findRecordsByFilter('invoices','daycare = {:school} && month = {:month} && status = "draft"','',0,0,{school:schoolId,month:date.slice(0,7)})
            if(drafts.length===1){const invoice=drafts[0];putTotals(invoice,[...(JSON.parse(invoice.getString('lines')||'[]')||[]),requestLine(r)]);tx.save(invoice);r.set('invoice_id',invoice.id)}
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
        const month=String(body.month||'')
        if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Choose a valid month.')
        if(body.invoice_date && !lib.validDate(String(body.invoice_date)))throw new Error('Choose a valid invoice date.')
        const existing=tx.findRecordsByFilter('invoices','daycare = {:school} && month = {:month} && status = "draft"','',1,0,{school:schoolId,month})
        if(existing.length)throw new Error('A draft already exists for this month. Edit it instead.')
        const h=history(),m=menus(),counts=[],groups={}
        const alreadyIssued=tx.findRecordsByFilter('invoices','daycare = {:school} && month = {:month} && status = "issued"','',1,0,{school:schoolId,month}).length>0
        const date=new Date(month+'-01T12:00:00Z')
        while(date.toISOString().startsWith(month)){
          const d=lib.daily(plain(school),h,m,date.toISOString().slice(0,10));counts.push({date:d.date,quantity:d.quantity,rate:d.rate,closed:d.closed});if(d.quantity && !alreadyIssued)groups[d.rate]=(groups[d.rate]||0)+d.quantity;date.setUTCDate(date.getUTCDate()+1)
        }
        const lines=Object.keys(groups).map(rate=>({description:month+' Lunch Catering',quantity:groups[rate],rate:Number(rate),taxable:true}))
        const extras=requests().filter(r=>{if(r.getString('kind')!=='lunch'||r.getString('status')!=='approved'||r.getString('invoice_id')||r.getString('service_date')>counts[counts.length-1].date)return false;const day=lib.daily(plain(school),h,m,r.getString('service_date'));return !day.closed && !day.roster.some(k=>k.id===r.getString('student')||String(k.name||'').trim().toLowerCase()===r.getString('student_label').trim().toLowerCase())})
        for(const r of extras)lines.push(requestLine(r))
        if(!lines.length)lines.push({description:month+(alreadyIssued?' Additional Adjustment':' Lunch Catering'),quantity:0,rate:school.getFloat('invoice_rate'),taxable:true})
        const slug=school.getString('public_slug'),prefix=slug==='lightbridge-bergenfield'?'BF':slug==='lightbridge-fort-lee'?'FL':slug==='tle-englewood-cliffs'?'TLE':'INV'
        const base=prefix+month.slice(5)+month.slice(2,4), same=tx.findRecordsByFilter('invoices','number ~ {:prefix}','',0,0,{prefix:base})
        let number=base,n=2;while(same.some(row=>row.getString('number')===number))number=base+'.'+n++
        const invoice=new Record(tx.findCollectionByNameOrId('invoices'))
        for(const [k,v] of Object.entries({daycare:schoolId,school_name:school.getString('name'),month,invoice_date:String(body.invoice_date||lib.nyDate()),number,status:'draft',daily_counts:alreadyIssued?[]:counts,notes:alreadyIssued?'Adjustment invoice. Monthly scheduled lunches were already invoiced. Due upon receipt.':'Due upon receipt.'}))invoice.set(k,v)
        putTotals(invoice,lines);tx.save(invoice);for(const r of extras){r.set('invoice_id',invoice.id);tx.save(r)}result=plain(invoice)
      } else if(action==='save'||action==='issue'||action==='delete') {
        if(!clc)throw new Error('CLC access is required.')
        const invoice=checkInvoice(body.id)
        if(invoice.getString('status')!=='draft')throw new Error('Issued invoices are frozen. Put corrections on a new invoice.')
        if(action==='delete'){
          for(const r of requests().filter(r=>r.getString('invoice_id')===invoice.id)){r.set('invoice_id','');tx.save(r)}tx.delete(invoice);result={deleted:true}
        }else{
          if(!String(body.number||'').trim()||!lib.validDate(String(body.invoice_date||'')))throw new Error('Invoice number and date are required.')
          const duplicate=tx.findRecordsByFilter('invoices','number = {:number} && id != {:id}','',1,0,{number:String(body.number).trim(),id:invoice.id});if(duplicate.length)throw new Error('Invoice number already exists.')
          // Auto-adjustments cannot be removed or converted to manual lines.
          const linked=requests().filter(r=>r.getString('invoice_id')===invoice.id)
          if(!Array.isArray(body.lines))throw new Error('Invoice lines are required.')
          const manual=body.lines.filter(line=>!line.request_id)
          const auto=linked.map(r=>requestLine(r));putTotals(invoice,[...manual,...auto])
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
  const keys=school?['count_mode','baseline_counts','clc_managed_counts','invoice_rate','billing_effective_date']:['active','service_days','size','billing_effective_date']
  const previous=e.record.original()
  if(keys.every(key=>e.record.getString(key)===previous.getString(key)))return e.next()
  e.app.runInTransaction(tx=>{e.app=tx;e.next();require(__hooks+'/schedule-lib.js').capture(tx,e.record,false)})
},'students','daycares')
onRecordDelete((e)=>{e.app.runInTransaction(tx=>{e.app=tx;require(__hooks+'/schedule-lib.js').capture(tx,e.record,true);e.next()})},'students')
