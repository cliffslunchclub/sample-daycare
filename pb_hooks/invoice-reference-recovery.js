// Restore only the explicitly supplied emailed BF1026 reference. Never replace
// other invoices or the live roster with the old backup.
function recover(app){
 const source=require(__hooks+'/bf1026-reference.json'),lib=require(__hooks+'/billing-lib.js'),calc=require(__hooks+'/invoice-adjustment-lib.js');
 const schools=app.findRecordsByFilter('daycares','public_slug = {:slug}','',1,0,{slug:source.school_slug});if(!schools.length)return;
 const school=schools[0],invoices=app.findRecordsByFilter('invoices','daycare = {:school} && number = {:number} && month = {:month}','',2,0,{school:school.id,number:source.number,month:source.month});
 if(invoices.length!==1)return;
 const invoice=invoices[0],existing=JSON.parse(invoice.getString('closed_snapshot')||'null');if(existing?.recovered_reference===source.version)return;
 const audit=require(__hooks+'/audit-lib.js'),students=app.findRecordsByFilter('students','daycare = {:school}','',0,0,{school:school.id});
 const histories=app.findRecordsByFilter('schedule_history','daycare = {:school} && entity != "school"','effective_date',0,0,{school:school.id});
 const candidates=new Map();for(const r of histories){const s=JSON.parse(r.getString('snapshot')||'{}');if(/^derek(?:\s|$)/i.test(String(s.name||'').trim()))candidates.set(r.getString('entity'),s.name);}for(const r of students)if(/^derek(?:\s|$)/i.test(r.getString('name').trim()))candidates.set(r.id,r.getString('name'));
 if(candidates.size!==1)throw new Error('The emailed BF1026 reference needs one matching Derek student/history record before it can be restored. No invoice was changed.');
 const derek=[...candidates.keys()][0];
 // Capture every recalculated value before restoring the emailed four lines.
 const prior=JSON.parse(JSON.stringify(invoice.publicExport())),repairs=[];
 const originalKillian=source.roster.find(s=>s.name==='Killian'),killian=students.find(s=>s.id===originalKillian?.id);
 if(killian){
  const days=JSON.parse(killian.getString('service_days')||'[]');
  if(killian.getBool('active')&&days.length===5&&days.includes('Tuesday')){
   for(const row of histories.filter(r=>r.getString('entity')===killian.id&&r.getString('effective_date')<'2026-10-19')){
    const snapshot=JSON.parse(row.getString('snapshot')||'{}');if((snapshot.service_days||[]).length===5&&snapshot.service_days.includes('Tuesday')){repairs.push({id:row.id,snapshot});row.set('snapshot',{...snapshot,service_days:snapshot.service_days.filter(d=>d!=='Tuesday')});app.save(row);}
   }
   const next=histories.find(r=>r.getString('entity')===killian.id&&r.getString('effective_date')==='2026-10-19');
   if(!next){killian.set('billing_effective_date','2026-10-19');audit.save(app,killian,null);}
  }
 }
 const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'roster',invoice_rate:4}},...source.roster.map(s=>({entity:s.id,effective_date:'2026-10-01',snapshot:s}))];
 const reference=calc.capture({public_slug:source.school_slug},h,[],'2026-10-01','2026-10-31');
 const nolan=source.roster.find(s=>s.name==='Nolan'),nolanUnit=reference.units[calc.key('student:'+nolan.id,4)];nolanUnit.quantity-=6;
 reference.units[calc.key('student:'+derek,4)]={entity:'student:'+derek,label:'Derek M',rate:4,quantity:4,dates:['2026-10-09','2026-10-16','2026-10-23','2026-10-30']};
 reference.requests={};reference.source_file=source.source_file;reference.source_sha256=source.sha256;
 if(Object.values(reference.units).reduce((n,u)=>n+u.quantity,0)!==587)throw new Error('BF1026 schedule reference does not reconcile.');
 const sum=lib.totals(source.lines);if(sum.total_cents!==231590)throw new Error('BF1026 emailed total does not reconcile.');
 for(const [k,v]of Object.entries(sum))invoice.set(k,v);
 for(const [k,v]of Object.entries({invoice_date:source.invoice_date,generated_notes:source.generated_notes,notes:'',daily_counts:[],billing_snapshot:reference,closed_snapshot:{version:1,recovered_reference:source.version,closed_at:new Date().toISOString(),source_file:source.source_file,source_sha256:source.sha256,reference,prior_saved_version:prior,killian_history_repairs:repairs},status:'closed',shared:true,show_payment_terms:false}))invoice.set(k,v);
 app.save(invoice);
 // These requests appeared only in the recalculated invoice, not the emailed PDF.
 for(const r of app.findRecordsByFilter('lunch_requests','daycare = {:school} && invoice_id = {:invoice}','',0,0,{school:school.id,invoice:invoice.id})){r.set('invoice_id','');audit.save(app,r,null);}
}
module.exports={recover};
