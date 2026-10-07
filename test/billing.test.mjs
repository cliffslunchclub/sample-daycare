import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={module:{exports:{}}};vm.runInNewContext(readFileSync(new URL('../pb_hooks/billing-lib.js',import.meta.url),'utf8'),context);const lib=context.module.exports;
const school={public_slug:'lightbridge-fort-lee'};
const history=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'manual',baseline_counts:{Monday:62,Friday:62},clc_managed_counts:{Monday:2},invoice_rate:4}},{entity:'school',effective_date:'2026-10-15',snapshot:{count_mode:'manual',baseline_counts:{Monday:60,Friday:60},clc_managed_counts:{Monday:2},invoice_rate:4.5}}];
test('effective-dated manual counts and rates exclude Allergies from billed quantity',()=>{const before=lib.daily(school,history,[],'2026-10-05'),after=lib.daily(school,history,[],'2026-10-19');assert.equal(before.quantity,62);assert.equal(before.allergies,2);assert.equal(after.quantity,60);assert.equal(after.rate,4.5);});
test('TLE Fridays follow effective counts and menu closures at the usual rate',()=>{
 const tle={public_slug:'tle-englewood-cliffs'};
 const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'manual',baseline_counts:{Monday:120,Friday:0},invoice_rate:3.5}},{entity:'school',effective_date:'2026-10-15',snapshot:{count_mode:'manual',baseline_counts:{Monday:120,Friday:120},invoice_rate:3.5}}];
 assert.equal(lib.daily(tle,h,[],'2026-10-09').closed,true);
 const enabled=lib.daily(tle,h,[],'2026-10-16');assert.equal(enabled.quantity,120);assert.equal(enabled.rate,3.5);assert.equal(enabled.closed,false);
 assert.equal(lib.daily(tle,h,[{service_date:'2026-10-16',closed:true}],'2026-10-16').quantity,0);
 assert.equal(lib.daily(school,history,[{service_date:'2026-10-05',closed:true}],'2026-10-05').quantity,0);
});
test('roster history honors inactive dates and service-day changes',()=>{const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'roster',invoice_rate:4}},{entity:'student',effective_date:'2026-10-01',snapshot:{active:true,service_days:['Monday']}},{entity:'student',effective_date:'2026-10-15',snapshot:{active:false,service_days:['Monday']}}];assert.equal(lib.daily(school,h,[],'2026-10-05').quantity,1);assert.equal(lib.daily(school,h,[],'2026-10-19').quantity,0);assert.throws(()=>lib.daily(school,h,[],'2026-09-30'),/No count history/);});
test('signed lines calculate tax in cents and respect non-taxable lines',()=>{const s=lib.totals([{description:'Meals',quantity:1144,rate:4},{description:'Credit',quantity:-198,rate:4},{description:'Exempt',quantity:1,rate:100,taxable:false}]);assert.equal(s.subtotal_cents,388400);assert.equal(s.tax_cents,25069);assert.equal(s.total_cents,413469);assert.throws(()=>lib.totals([{description:'Bad',quantity:NaN,rate:4}]));});
test('invoice sample totals and New York month rollover are correct',()=>{const s=lib.totals([{description:'Lunch',quantity:1144,rate:4},{description:'Milk',quantity:32,rate:5},{description:'Breakfast',quantity:1,rate:120},{description:'Staff lunch',quantity:1,rate:71.5},{description:'Adjustment',quantity:280,rate:4},{description:'Credit',quantity:-198,rate:4}]);assert.equal(s.total_cents,560368);assert.equal(lib.nyDate(new Date('2026-11-01T03:59:59Z')),'2026-10-31');assert.equal(lib.nyDate(new Date('2026-11-01T04:00:00Z')),'2026-11-01');assert.equal(lib.nyDate(new Date('2026-12-01T04:59:59Z')),'2026-11-30');});
test('multi-day requests normalize dates, retain single-day compatibility, and reject invalid lists',()=>{assert.equal(JSON.stringify(lib.requestDates(['2026-10-08','2026-10-05','2026-10-05'])),'["2026-10-05","2026-10-08"]');assert.equal(JSON.stringify(lib.requestDates(undefined,'2026-10-05')),'["2026-10-05"]');assert.throws(()=>lib.requestDates([]));assert.throws(()=>lib.requestDates(['2026-02-30']));assert.throws(()=>lib.requestDates('2026-10-05'));assert.throws(()=>lib.requestDates(Array.from({length:32},(_,i)=>new Date(Date.UTC(2026,9,i+1)).toISOString().slice(0,10))));});
test('monthly baseline and separate student additions/removals reconcile without double counting',()=>{
 const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'roster',invoice_rate:4}},{entity:'a',effective_date:'2026-10-01',snapshot:{name:'Anna Smith',active:true,service_days:['Monday','Tuesday','Wednesday','Thursday','Friday']}},{entity:'a',effective_date:'2026-10-15',snapshot:{name:'Anna Smith',active:false,service_days:['Monday','Tuesday','Wednesday','Thursday','Friday']}},{entity:'b',effective_date:'2026-10-15',snapshot:{name:'Leo Stern',active:true,service_days:['Monday','Tuesday','Wednesday','Thursday','Friday']}}];
 const plan=lib.monthlyPlan(school,h,[],'2026-10');assert.equal(plan.lines[0].quantity,22);const additions=plan.lines.find(l=>l.description.includes('additions'));const removals=plan.lines.find(l=>l.description.includes('removals'));assert.equal(additions.quantity,12);assert.equal(removals.quantity,-12);assert.match(additions.description,/Leo S.*10-15-2026/);assert.equal(plan.lines.reduce((n,l)=>n+l.quantity,0),plan.counts.reduce((n,d)=>n+d.quantity,0));assert.match(plan.notes,/Total service days: 22/);
});
test('manual weekday notes and signed midmonth count adjustments respect closures',()=>{
 const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'manual',baseline_counts:{Monday:10,Tuesday:20},invoice_rate:4}},{entity:'school',effective_date:'2026-10-15',snapshot:{count_mode:'manual',baseline_counts:{Monday:12,Tuesday:18},invoice_rate:4}}];const plan=lib.monthlyPlan(school,h,[{service_date:'2026-10-05',closed:true}],'2026-10');assert.match(plan.notes,/Monday: 10 meals\/day x 3 days = 30 meals/);assert.match(plan.notes,/Tuesday: 20 meals\/day x 4 days = 80 meals/);assert.equal(plan.lines.reduce((n,l)=>n+l.quantity,0),plan.counts.reduce((n,d)=>n+d.quantity,0));assert.equal(lib.displayDate('2026-10-05'),'10-05-2026');
});

test('two-week Monday periods set first-Friday send date and second-Friday due date across months',()=>{
 const p=lib.biweeklyPeriod('2026-10-26');assert.equal(p.period_end,'2026-11-06');assert.equal(p.invoice_date,'2026-10-30');assert.equal(p.due_date,'2026-11-06');assert.equal(p.next_start,'2026-11-09');
 assert.throws(()=>lib.biweeklyPeriod('2026-10-27'),/Monday/);
 const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'manual',baseline_counts:{Monday:120,Tuesday:120,Wednesday:120,Thursday:120,Friday:0},invoice_rate:3.5}},{entity:'school',effective_date:'2026-11-02',snapshot:{count_mode:'manual',baseline_counts:{Monday:125,Tuesday:125,Wednesday:125,Thursday:125,Friday:0},invoice_rate:3.5}}];
 const plan=lib.monthlyPlan({public_slug:'tle-englewood-cliffs'},h,[],'2026-10',p.period_start,p.period_end);
 assert.equal(plan.counts.length,12);assert.equal(plan.counts.reduce((n,d)=>n+d.quantity,0),980);assert.equal(plan.lines.reduce((n,l)=>n+l.quantity,0),980);
 assert.equal(plan.lines.find(l=>l.adjustment_type==='schedule').quantity,20);assert.match(plan.notes,/Total service days: 8/);
});
test('carry-forward corrections include date and source, reconcile credits and rates, and do not repeat',()=>{
 const school={public_slug:'tle-englewood-cliffs'};
 const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'manual',baseline_counts:{Monday:120},invoice_rate:3.5}},{entity:'school',effective_date:'2026-10-19',snapshot:{count_mode:'manual',baseline_counts:{Monday:125},invoice_rate:3.5}}];
 const original={id:'first',number:'TLE1012',billing_cycle:'biweekly',status:'issued',period_start:'2026-10-12',period_end:'2026-10-23',daily_counts:[{date:'2026-10-12',quantity:120,rate:3.5},{date:'2026-10-19',quantity:120,rate:3.5}],lines:[]};
 let corrections=lib.carryForward(school,h,[],[original],'2026-10-26');assert.equal(corrections.length,1);assert.equal(corrections[0].quantity,5);assert.match(corrections[0].description,/10-19-2026.*120 to 125/);
 const next={id:'second',billing_cycle:'biweekly',status:'issued',period_start:'2026-10-26',period_end:'2026-11-06',daily_counts:[],lines:corrections};
 assert.equal(lib.carryForward(school,h,[],[original,next],'2026-11-09').length,0);
 corrections=lib.carryForward(school,h,[{service_date:'2026-10-19',closed:true}],[original,next],'2026-11-09');assert.equal(corrections[0].quantity,-125);
 const changed=[...h,{entity:'school',effective_date:'2026-10-19',snapshot:{count_mode:'manual',baseline_counts:{Monday:125},invoice_rate:4}}];
 changed.splice(1,1);corrections=lib.carryForward(school,changed,[],[original,next],'2026-11-09');assert.equal(corrections.length,2);assert.equal(corrections.reduce((n,l)=>n+l.quantity*l.rate,0),62.5);
});

test('Friday-only additions bill all four remaining October Fridays and honor closures',()=>{
 const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'roster',invoice_rate:4}},{entity:'martin',effective_date:'2026-10-09',snapshot:{name:'Martin',active:true,service_days:['Friday']}}];
 const plan=lib.monthlyPlan(school,h,[],'2026-10');
 assert.equal(plan.lines.find(l=>l.adjustment_type==='schedule').quantity,4);
 assert.equal(plan.counts.filter(d=>d.quantity).map(d=>d.date).join(','),'2026-10-09,2026-10-16,2026-10-23,2026-10-30');
 assert.equal(lib.monthlyPlan(school,h,[{service_date:'2026-10-23',closed:true}],'2026-10').lines[0].quantity,3);
});
test('next-day additions and removals leave today unchanged and reconcile the invoice',()=>{
 const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
 const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'roster',invoice_rate:4}},{entity:'old',effective_date:'2026-10-01',snapshot:{name:'Old',active:true,service_days:days}},{entity:'old',effective_date:'2026-10-08',snapshot:{name:'Old',active:false,service_days:days}},{entity:'new',effective_date:'2026-10-08',snapshot:{name:'New',active:true,service_days:['Friday']}}];
 assert.equal(lib.daily(school,h,[],'2026-10-07').quantity,1);
 assert.equal(lib.daily(school,h,[],'2026-10-08').quantity,0);
 const plan=lib.monthlyPlan(school,h,[],'2026-10');
 assert.equal(plan.lines.find(l=>l.quantity<0).quantity,-17);
 assert.equal(plan.lines.find(l=>l.description.includes('additions')).quantity,4);
 assert.equal(plan.lines.reduce((sum,l)=>sum+l.quantity,0),plan.counts.reduce((sum,d)=>sum+d.quantity,0));
 assert.equal(lib.addDays(lib.nyDate(new Date('2026-11-01T05:30:00Z')),1),'2026-11-02');
});

test('three-to-two-day reduction starts tomorrow and keeps today billed',()=>{
 const h=[{entity:'school',effective_date:'2026-10-01',snapshot:{count_mode:'roster',invoice_rate:4}},{entity:'nolan',effective_date:'2026-10-01',snapshot:{name:'Nolan',active:true,service_days:['Monday','Wednesday','Friday']}},{entity:'nolan',effective_date:'2026-10-08',snapshot:{name:'Nolan',active:true,service_days:['Monday','Friday']}}];
 assert.equal(lib.daily(school,h,[],'2026-10-07').quantity,1);
 assert.equal(lib.daily(school,h,[],'2026-10-14').quantity,0);
 const plan=lib.monthlyPlan(school,h,[],'2026-10');
 const credit=plan.lines.find(line=>line.adjustment_type==='schedule');
 assert.equal(credit.quantity,-3);assert.equal(credit.effective_date,'2026-10-08');
 assert.equal(plan.lines.reduce((sum,line)=>sum+line.quantity,0),plan.counts.reduce((sum,day)=>sum+day.quantity,0));
});
