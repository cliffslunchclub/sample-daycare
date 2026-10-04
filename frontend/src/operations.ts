export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export type Weekday = typeof weekdays[number];
export type ScheduledStudent = { active: boolean; service_days: string[] };

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

export function monthlyMealUnits(students: ScheduledStudent[], month: string, closedDates: Set<string> = new Set()) {
  const dates = monthWeekdays(month).filter((date) => !closedDates.has(date));
  const breakdown = weekdays.map((weekday) => {
    const serviceDates = dates.filter((date) => weekdayForDate(date) === weekday);
    const studentsPerDay = students.filter((student) => student.active && student.service_days.includes(weekday)).length;
    return { weekday, serviceDates, studentsPerDay, units: serviceDates.length * studentsPerDay };
  });
  return { breakdown, totalUnits: breakdown.reduce((total, day) => total + day.units, 0) };
}
