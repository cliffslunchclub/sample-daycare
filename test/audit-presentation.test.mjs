import test from 'node:test';
import assert from 'node:assert/strict';
import { auditValue, auditSummary, auditField } from '../frontend/src/auditPresentation.ts';
const school='aaaaaaaaaaaaaaa',kid='bbbbbbbbbbbbbbb',room='ccccccccccccccc';
const refs={[`students:${kid}`]:{name:'RJ',daycare:school},[`classrooms:${room}`]:{name:'Preschool 2',daycare:school},[`daycares:${school}`]:{name:'Lightbridge Bergenfield',sub_c_label:'Chicken and rice'}};
test('legacy audit IDs, SQL dates, roles, counts, and substitution codes are readable',()=>{
 const row={daycare:school};assert.equal(auditField('service_date'),'Lunch Date');assert.equal(auditValue('2026-10-09 00:00:00.000Z','service_date'),'10-09-2026');
 assert.equal(auditValue(kid,'student',row,refs),'RJ');assert.equal(auditValue(room,'classroom',row,refs),'Preschool 2');assert.equal(auditValue('C','code',row,refs),'C — Chicken and rice');
 assert.equal(auditValue('daycare_admin','role'),'School Administrator');assert.equal(auditValue({Monday:20,Friday:15},'baseline_counts'),'Monday: 20; Friday: 15');
 assert.equal(auditValue(['2026-10-09','2026-10-16'],'service_dates'),'10-09-2026, 10-16-2026');assert.equal(auditValue(4,'invoice_rate'),'$4.00');
});
test('student and substitution history has understandable summaries',()=>{
 assert.equal(auditSummary({entity_type:'students',action:'create',entity_label:'Emma S',daycare:school,changes:{name:{after:'Emma S'},classroom:{after:room}}},refs),'Added Emma S to Preschool 2');
 assert.equal(auditSummary({entity_type:'students',action:'update',entity_label:'Emma S',daycare:school,changes:{service_days:{before:['Monday','Wednesday','Friday'],after:['Monday','Friday']}}},refs),'Changed Emma S’s lunch days from Monday, Wednesday, Friday to Monday, Friday');
 assert.equal(auditSummary({entity_type:'substitutions',action:'delete',entity_label:'2026-10-09 00:00:00.000Z',daycare:school,changes:{student:{before:kid},weekday:{before:'Friday'}}},refs),'Removed RJ’s Friday substitution');
 assert.equal(auditSummary({entity_type:'menu_days',action:'update',entity_label:'2026-10-16 00:00:00Z',school_name:'Bergenfield',changes:{menu:{before:'Pasta',after:'Rice'}}}),'Updated Bergenfield’s menu for 10-16-2026');
});
test('saved names survive deleted records and unrelated school records never provide names',()=>{
 const row={daycare:school,entity_type:'substitutions',action:'delete',changes:{student:{before:kid,before_label:'RJ'},__display:{before:{subject:'RJ',weekday:'Friday'}}}};
 assert.equal(auditValue(kid,'student',row,{},'before'),'RJ');assert.equal(auditSummary(row),'Removed RJ’s Friday substitution');
 assert.equal(auditValue(kid,'student',{daycare:'other'},{[`students:${kid}`]:{name:'Private Student',daycare:school}}),'Deleted or unavailable student');
 assert.equal(auditSummary({entity_type:'school_notes',action:'create',entity_id:kid,entity_label:kid,school_name:'Bergenfield',changes:{note:{after:'Hello'}}}),'Added a school note for Bergenfield');
});
