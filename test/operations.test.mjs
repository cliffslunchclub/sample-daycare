import test from 'node:test';
import assert from 'node:assert/strict';
import { monthWeekdays, monthlyMealUnits, weekdayForDate, weekDates } from '../frontend/src/operations.ts';

test('weekly view starts Monday and returns five service days', () => {
  assert.deepEqual(weekDates(new Date(2026, 9, 3)), [
    '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
  ]);
  assert.equal(weekdayForDate('2026-10-05'), 'Monday');
});

test('monthly billing counts recurring students and skips closed weekdays', () => {
  const students = [
    { active: true, service_days: ['Monday', 'Wednesday'] },
    { active: true, service_days: ['Friday'] },
    { active: false, service_days: ['Monday', 'Friday'] },
  ];
  const result = monthlyMealUnits(students, '2026-10', new Set(['2026-10-05']));
  assert.equal(monthWeekdays('2026-10').length, 22);
  assert.equal(result.breakdown.find((d) => d.weekday === 'Monday').units, 3);
  assert.equal(result.breakdown.find((d) => d.weekday === 'Wednesday').units, 4);
  assert.equal(result.breakdown.find((d) => d.weekday === 'Friday').units, 5);
  assert.equal(result.totalUnits, 12);
});

test('monthly billing includes aggregate school headcounts and skips closed days', () => {
  const result = monthlyMealUnits([], '2026-10', new Set(['2026-10-05']), {
    Monday: 0, Tuesday: 0, Wednesday: 120, Thursday: 120, Friday: 0,
  });
  assert.equal(result.breakdown.find((d) => d.weekday === 'Wednesday').units, 480);
  assert.equal(result.breakdown.find((d) => d.weekday === 'Thursday').units, 600);
  assert.equal(result.totalUnits, 1080);
});
