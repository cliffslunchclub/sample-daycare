import test from 'node:test';
import assert from 'node:assert/strict';
import {schoolToday,pastStudent,inRoster,studentScheduled} from '../frontend/src/studentLifecycle.ts';
test('roster status changes after the inclusive last lunch date in New York',()=>{
 const student={active:true,last_lunch_date:'2026-10-30'};
 assert.equal(pastStudent(student,'2026-10-30'),false);assert.equal(pastStudent(student,'2026-10-31'),true);
 assert.equal(inRoster(student,'active','2026-10-30'),true);assert.equal(inRoster(student,'past','2026-10-31'),true);assert.equal(inRoster(student,'all','2026-11-02'),true);
 assert.equal(inRoster({active:false},'active','2026-10-30'),false);
 assert.equal(studentScheduled(student,'2026-10-30'),true);assert.equal(studentScheduled(student,'2026-11-02'),false);
 assert.equal(schoolToday(new Date('2026-10-31T02:00:00Z')),'2026-10-30');
 assert.equal(schoolToday(new Date('2026-11-02T04:30:00Z')),'2026-11-01');
});
