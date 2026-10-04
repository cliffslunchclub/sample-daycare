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

test('parent months require every weekday published and expire at New York month rollover', async () => {
  const { publishedMenuMonths } = await import('../frontend/src/operations.ts');
  const october = monthWeekdays('2026-10').map(service_date => ({ service_date, published: true }));
  const november = monthWeekdays('2026-11').map(service_date => ({ service_date, published: true }));
  assert.deepEqual(publishedMenuMonths([...october, ...november], new Date('2026-11-01T03:59:00Z')), ['2026-10', '2026-11']);
  assert.deepEqual(publishedMenuMonths([...october, ...november], new Date('2026-11-01T04:00:00Z')), ['2026-11']);
  assert.deepEqual(publishedMenuMonths(november.slice(1), new Date('2026-10-04T12:00:00Z')), []);
  assert.deepEqual(publishedMenuMonths(november.map((row, index) => ({ ...row, published: index !== 0 })), new Date('2026-10-04T12:00:00Z')), []);
});

test('editor calendar pads full weekday rows so October 1 is Thursday', async () => {
  const { monthCalendarWeekdays } = await import('../frontend/src/operations.ts');
  const october = monthCalendarWeekdays('2026-10');
  assert.deepEqual(october.slice(0, 5), ['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02']);
  assert.equal(october.indexOf('2026-10-01') % 5, 3);
  assert.deepEqual(monthCalendarWeekdays('2026-11').slice(-5), ['2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04']);
});
