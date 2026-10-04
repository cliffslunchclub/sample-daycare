import test from 'node:test';
import assert from 'node:assert/strict';
import { menuItems, menuMonthOptions, monthWeekdays, suggestedMenuForDate, weekdayForDate, weekDates } from '../frontend/src/operations.ts';

test('weekly view starts Monday and returns five service days', () => {
  assert.deepEqual(weekDates(new Date(2026, 9, 3)), [
    '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
  ]);
  assert.equal(weekdayForDate('2026-10-05'), 'Monday');
});

test('month calendar shows this month and one month ahead', () => {
  assert.deepEqual(menuMonthOptions(new Date(2026, 9, 31)), ['2026-10', '2026-11']);
  assert.deepEqual(menuMonthOptions(new Date(2026, 10, 1)), ['2026-11', '2026-12']);
  assert.equal(monthWeekdays('2026-10').length, 22);
});

test('weekday menu suggestions follow the editable weekly rotation', () => {
  assert.equal(suggestedMenuForDate('2026-10-06'), menuItems[1]);
  assert.equal(suggestedMenuForDate('2026-10-13'), menuItems[2]);
  assert.equal(suggestedMenuForDate('2026-10-20'), menuItems[1]);
  assert.equal(suggestedMenuForDate('2026-10-08'), menuItems[5]);
  assert.equal(suggestedMenuForDate('2026-10-15'), menuItems[6]);
});
