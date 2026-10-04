export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export type Weekday = typeof weekdays[number];

export const menuItems = [
  'Grilled Chicken & Veggies\nSteamed Rice',
  'Broccoli Butter Pasta\nGarlic Bread',
  'Beef & Veggie Bolognese Pasta\nGarlic Bread',
  'Chicken Nuggets\nTater Tots',
  'Angus Beef Sliders\nFries',
  'Chicken Penne alla Vodka\nPeas & Carrots',
  'Bowtie Pasta with Peas & Meatballs',
  'Bowtie Chicken Alfredo\nPeas & Carrots',
  'Pizza\nSweet Potato Fries',
] as const;

const menuCycles: Record<Weekday, readonly string[]> = {
  Monday: [menuItems[0]],
  Tuesday: [menuItems[1], menuItems[2]],
  Wednesday: [menuItems[3]],
  Thursday: [menuItems[5], menuItems[6], menuItems[7]],
  Friday: [menuItems[8]],
};

export function menuMonthOptions(today: Date = new Date()): string[] {
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return [current, nextMonth(current)];
}

export function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function suggestedMenuForDate(value: string): string {
  const weekday = weekdayForDate(value);
  const [year, month, day] = value.split('-').map(Number);
  const date = Date.UTC(year, month - 1, day);
  const anchor = Date.UTC(2026, 9, 5); // The Monday before the supplied October menu.
  const cycleWeek = Math.floor((date - anchor) / (7 * 24 * 60 * 60 * 1000));
  const cycle = menuCycles[weekday];
  return cycle[((cycleWeek % cycle.length) + cycle.length) % cycle.length];
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function weekdayForDate(value: string): Weekday {
  return weekdays[(new Date(`${value}T12:00:00`).getDay() + 6) % 7];
}

export function weekDates(anchor: Date): string[] {
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return weekdays.map((_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return isoDate(date);
  });
}

export function monthWeekdays(month: string): string[] {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return [];
  const days = new Date(year, m, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= days; day++) {
    const date = new Date(year, m - 1, day);
    if (date.getDay() !== 0 && date.getDay() !== 6) dates.push(isoDate(date));
  }
  return dates;
}
