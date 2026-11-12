// Date-sensitive roster view for Weekly Kitchen Summary.
// Reading only current students can show a future-effective schedule too early.
export type RosterVersion = {
  entity: string;
  effective_date: string;
  snapshot: {
    active?: boolean;
    name?: string;
    service_days?: string[];
    classroom?: string;
    size?: string;
    last_lunch_date?: string;
  };
};
export type RosterStudent = {
  id: string;
  name: string;
  daycare: string;
  classroom: string;
  size: string;
  active: boolean;
  last_lunch_date?: string;
  service_days: string[];
};

export function scheduledStudentsForDate<T extends RosterStudent>(
  students: T[], versions: RosterVersion[], schoolId: string, day: string, date: string,
): T[] {
  const byStudent = new Map<string, RosterVersion[]>();
  for (const version of versions) {
    if (version.entity === 'school') continue;
    const records = byStudent.get(version.entity) || [];
    records.push(version);
    byStudent.set(version.entity, records);
  }
  for (const records of byStudent.values()) records.sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  const hasHistory = versions.length > 0;
  return students.flatMap(student => {
    if (student.daycare !== schoolId) return [];
    const version = byStudent.get(student.id)?.find(row => row.effective_date <= date);
    if (!version && hasHistory) return [];
    const snapshot = version?.snapshot;
    const lastDate = student.last_lunch_date || snapshot?.last_lunch_date || '';
    if (lastDate && date > lastDate) return [];
    if (!(snapshot ? snapshot.active : student.active)) return [];
    const serviceDays = snapshot?.service_days || student.service_days;
    if (!serviceDays.includes(day)) return [];
    return [{...student, name: snapshot?.name || student.name, size: snapshot?.size || student.size, classroom: snapshot?.classroom || student.classroom, service_days: serviceDays}];
  });
}
